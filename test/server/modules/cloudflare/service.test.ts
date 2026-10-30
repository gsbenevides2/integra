import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

import {
  fakeDbCalls,
  fakeDbResults,
  installFakeDb,
  resetFakeDb,
} from "../../../helpers/tuya-db";

process.env.CLOUDFLARE_API_TOKEN = "tok";
process.env.CLOUDFLARE_RULE_ID = "rule";
process.env.CLOUDFLARE_RULESET_ID = "set";
process.env.CLOUDFLARE_ZONE_ID = "zone";

const restoreDb = await installFakeDb();
const edit = mock(async (..._args: unknown[]) => ({}));
mock.module("cloudflare", () => ({
  default: class {
    rulesets = { rules: { edit } };
  },
}));
const { CloudflareRules } =
  await import("@server/modules/cloudlflare/service/cloudflarerules");
afterAll(() => restoreDb());

const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
const cookie = CloudflareRules.bypass_cookie;

beforeEach(() => {
  resetFakeDb();
  edit.mockClear();
});

const editBody = () => edit.mock.calls[0]![1] as Record<string, unknown>;

describe("getValidTokens / checkIfIsValid", () => {
  test("maps rows to ids", async () => {
    fakeDbResults.push([{ id: T1 }, { id: T2 }]);
    expect(await CloudflareRules.getValidTokens()).toEqual([T1, T2]);
  });

  test("checkIfIsValid reflects membership", async () => {
    fakeDbResults.push([{ id: T1 }], [{ id: T1 }]);
    expect(await CloudflareRules.checkIfIsValid(T1)).toBe(true);
    expect(await CloudflareRules.checkIfIsValid(T2)).toBe(false);
  });
});

describe("updateCf", () => {
  test("no valid tokens disables the rule", async () => {
    fakeDbResults.push([]);
    await CloudflareRules.updateCf();
    expect(edit.mock.calls[0]![0]).toBe("rule");
    expect(editBody()).toEqual({
      ruleset_id: "set",
      zone_id: "zone",
      action: "set_config",
      enabled: false,
    });
  });

  test("one token matches its cookie", async () => {
    fakeDbResults.push([{ id: T1 }]);
    await CloudflareRules.updateCf();
    expect(editBody().enabled).toBe(true);
    expect(editBody().expression).toBe(
      `(http.host contains "integra.infra.gui.dev.br" and http.cookie contains "${cookie}=${T1}")`,
    );
  });

  test("several tokens are OR-ed", async () => {
    fakeDbResults.push([{ id: T1 }, { id: T2 }]);
    await CloudflareRules.updateCf();
    expect(editBody().expression).toBe(
      `(http.host contains "integra.infra.gui.dev.br" and ((http.cookie contains "${cookie}=${T1}") or (http.cookie contains "${cookie}=${T2}")))`,
    );
    expect(editBody().action_parameters).toEqual({
      security_level: "essentially_off",
    });
  });
});

describe("createToken / inativateToken", () => {
  test("createToken inserts an active token and syncs Cloudflare", async () => {
    fakeDbResults.push(undefined, [{ id: "x" }]);
    const token = await CloudflareRules.createToken();
    expect(token).toMatch(/^[0-9a-f-]{36}$/);
    const insert = fakeDbCalls.find((c) => c.method === "values")!;
    expect(insert.args[0]).toEqual({ id: token, active: true });
    expect(edit).toHaveBeenCalledTimes(1);
  });

  test("inativateToken deactivates and syncs Cloudflare", async () => {
    fakeDbResults.push(undefined, []);
    await CloudflareRules.inativateToken(T1);
    expect(fakeDbCalls.find((c) => c.method === "set")!.args[0]).toEqual({
      active: false,
    });
    expect(editBody().enabled).toBe(false);
  });
});
