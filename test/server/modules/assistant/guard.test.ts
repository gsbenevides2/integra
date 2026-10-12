import {
  findByName,
  guardedTool,
  isToolError,
  NO_PERMISSION,
  normalizeName,
} from "@server/modules/assistant/tools/guard";
import * as authz from "@server/shared/authz";

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { z } from "zod";

import { makeContext, runTool } from "./helpers";

const spies: { mockRestore: () => void }[] = [];
afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

function grant(allowed: boolean) {
  spies.push(spyOn(authz, "hasRouteGrant").mockResolvedValue(allowed));
}

const items = [{ name: "Luz da Sala" }, { name: "Luz do Quarto" }, { name: "Abajur" }];

describe("name helpers", () => {
  test("normalizeName strips accents, case and extra spaces", () => {
    expect(normalizeName("  Luz   da SÁLA ")).toBe("luz da sala");
  });

  test("findByName prefers exact matches, then a single partial one", () => {
    expect(findByName(items, "luz da sala", "dispositivo")).toBe(items[0]!);
    expect(findByName(items, "quarto", "dispositivo")).toBe(items[1]!);
    expect(findByName(items, "o abajur da mesa", "dispositivo")).toBe(items[2]!);
  });

  test("findByName reports ambiguous and missing names", () => {
    expect(findByName(items, "luz", "dispositivo")).toEqual({
      error: 'Mais de um dispositivo corresponde a "luz". Disponíveis: Luz da Sala, Luz do Quarto.',
    });
    expect(findByName(items, "garagem", "dispositivo")).toEqual({
      error: 'Nenhum dispositivo chamado "garagem". Disponíveis: Luz da Sala, Luz do Quarto, Abajur.',
    });
    expect(findByName([], "x", "cena")).toEqual({
      error: 'Nenhum cena chamado "x". Disponíveis: nenhum.',
    });
  });

  test("isToolError only matches error-shaped objects", () => {
    expect(isToolError({ error: "x" })).toBe(true);
    expect(isToolError({ error: 1 })).toBe(false);
    expect(isToolError(null)).toBe(false);
    expect(isToolError("x")).toBe(false);
  });
});

describe("guardedTool", () => {
  const build = (execute: () => Promise<{ value: number } | { error: string }>) => {
    const ctx = makeContext();
    const tools = [
      guardedTool(ctx, {
        name: "t",
        description: "d",
        routeKeys: ["GET /a", "GET /b"],
        inputSchema: z.object({}),
        execute,
        summarize: (_input, output) => `valor ${output.value}`,
      }),
    ];
    return { ctx, tools };
  };

  test("runs and records a successful call", async () => {
    grant(true);
    const { ctx, tools } = build(async () => ({ value: 7 }));
    expect(await runTool(tools, "t")).toEqual({ value: 7 });
    expect(ctx.actions).toEqual([{ tool: "t", ok: true, summary: "valor 7" }]);
  });

  test("streams the tool start, its action and any new images", async () => {
    grant(true);
    const presign = spyOn(Bun.s3 as never, "presign" as never).mockReturnValue("https://signed" as never);
    const ctx = makeContext();
    const events: unknown[] = [];
    ctx.emit = (event) => events.push(event);
    const tools = [
      guardedTool(ctx, {
        name: "t",
        description: "d",
        routeKeys: [],
        inputSchema: z.object({}),
        execute: async () => {
          ctx.images.push({ key: "k", mediaType: "image/png", source: "generated" });
          return { value: 1 };
        },
        summarize: () => "feito",
      }),
    ];
    await runTool(tools, "t");
    presign.mockRestore();
    expect(events).toEqual([
      { type: "tool", tool: "t" },
      { type: "action", action: { tool: "t", ok: true, summary: "feito" } },
      { type: "image", image: { key: "k", mediaType: "image/png", source: "generated", url: "https://signed" } },
    ]);
  });

  test("refuses without the route grant", async () => {
    grant(false);
    let ran = false;
    const { ctx, tools } = build(async () => {
      ran = true;
      return { value: 1 };
    });
    expect(await runTool(tools, "t")).toEqual(NO_PERMISSION);
    expect(ran).toBe(false);
    expect(ctx.actions[0]).toMatchObject({ ok: false });
  });

  test("turns thrown errors and returned errors into failed actions", async () => {
    grant(true);
    const thrown = build(async () => {
      throw new Error("boom");
    });
    expect(await runTool(thrown.tools, "t")).toEqual({ error: "Falha ao executar: boom" });

    const nonError = build(async () => {
      throw "raw";
    });
    expect(await runTool(nonError.tools, "t")).toEqual({ error: "Falha ao executar: raw" });

    const returned = build(async () => ({ error: "nope" }));
    await runTool(returned.tools, "t");
    expect(returned.ctx.actions).toEqual([{ tool: "t", ok: false, summary: "nope" }]);
  });
});
