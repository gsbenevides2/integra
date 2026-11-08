import "@public/components/GlobalDrawerContext"; // load order: avoids dashboard <-> drawer import cycle

import React from "react";

import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, describe, expect, mock, spyOn, test } from "bun:test";

import { fail, fakeRecharts, malformed, useApi } from "../../../helpers/dash-api";
import { renderWithProviders } from "../../../helpers/public-render";

const realRecharts = { ...(await import("recharts")) };
mock.module("recharts", () => fakeRecharts(React));
afterAll(() => mock.module("recharts", () => realRecharts));

const { statusPlatformDashboard } = await import("@public/dashboards/status-platform/index");
const { PLATFORMS } = await import("@server/modules/status-platform/model");
const Dashboard = statusPlatformDashboard.content;

const row = (id: string, status: "OK" | "DOWN" | null, extra = {}) => ({
  id,
  name: `Plat ${id}`,
  url: `https://${id}.test`,
  type: PLATFORMS[0],
  ignoreSsl: false,
  status,
  problemDescription: status === "DOWN" ? "it broke" : null,
  lastCheckedAt: null,
  ...extra,
});
const rows = [row("1", "OK"), row("2", "DOWN"), row("3", null)];

const now = Date.now();
const iso = (secAgo: number) => new Date(now - secAgo * 1000).toISOString();
const history = (over = {}) => ({
  checks: [
    { status: "OK", problemDescription: null, checkedAt: iso(500) },
    { status: "DOWN", problemDescription: "x", checkedAt: iso(100) },
  ],
  segments: [
    { status: "OK", startedAt: iso(5 * 86400), endedAt: iso(2 * 86400), problemDescription: null },
    { status: "DOWN", startedAt: iso(3 * 3600 + 300), endedAt: iso(300), problemDescription: "x" },
    { status: "OK", startedAt: iso(300), endedAt: iso(270), problemDescription: null },
    { status: "DOWN", startedAt: iso(270), endedAt: null, problemDescription: "x" },
    { status: "OK", startedAt: iso(30), endedAt: iso(0), problemDescription: null },
  ],
  hasMore: true,
  nextCursor: "c1",
  ...over,
});

let listReply: unknown = rows;
let historyFn: (q: Record<string, string>) => unknown = () => history();
let writeFail = false;
let writeThrow = false;
const calls = useApi({
  "GET /api/status-platform/list": () => listReply,
  "GET /api/status-platform/:id/history": ({ query }) => historyFn(query),
  "DELETE /api/status-platform/:id": () => (writeFail ? fail() : { ok: true }),
  "POST /api/status-platform/refresh": () => (writeFail ? fail() : { ok: true }),
  "POST /api/status-platform": () => {
    if (writeThrow) return malformed();
    return writeFail ? fail() : { ok: true };
  },
  "PATCH /api/status-platform/:id": () => (writeFail ? fail() : { ok: true }),
});
afterEach(() => {
  cleanup();
  listReply = rows;
  historyFn = () => history();
  writeFail = writeThrow = false;
});

const field = (label: string) =>
  screen.getByText(label).parentElement!.querySelector("input,select") as
    | HTMLInputElement
    | HTMLSelectElement;
const submit = () => fireEvent.submit(screen.getByText("Salvar").closest("form")!);
const ctrlBtns = (card: string) =>
  Array.from(screen.getByText(card).closest(".cursor-pointer")!.querySelectorAll("button"));

describe("StatusPlatformDashboard", () => {
  test("metadata, skeleton and cards", async () => {
    const { container } = renderWithProviders(<Dashboard />);
    expect(container.querySelectorAll(".animate-pulse").length).toBe(6);
    await screen.findByText("Nome: Plat 1");
    fireEvent.click(screen.getByLabelText("Abrir menu"));
    expect(screen.getByText("Status: Operacional")).toBeTruthy();
    expect(screen.getByText("Status: Fora do ar")).toBeTruthy();
    expect(screen.getByText("Status: Ainda não verificado")).toBeTruthy();
    expect(screen.getByText("it broke")).toBeTruthy();
  });

  test("list failure and empty state with add button", async () => {
    listReply = fail();
    const { unmount } = renderWithProviders(<Dashboard />);
    await screen.findByText("Falha ao buscar plataformas");
    unmount();
    listReply = [];
    renderWithProviders(<Dashboard />);
    await screen.findByText("Nenhuma plataforma cadastrada ainda");
    fireEvent.click(screen.getAllByText("Adicionar plataforma")[1]!.closest("button")!);
    const form = await screen.findByRole("dialog", {
      name: "Adicionar plataforma",
    });
    within(form).getByText("Cancelar");
  });

  test("sorts platforms by name in the frontend", async () => {
    listReply = [
      { ...row("2", "OK"), name: "Zulu" },
      { ...row("1", "OK"), name: "alfa" },
      { ...row("3", "OK"), name: "Beta" },
    ];
    renderWithProviders(<Dashboard />);
    await screen.findByText("Nome: alfa");
    expect(
      screen.getAllByText(/^Nome: /).map((element) => element.textContent),
    ).toEqual(["Nome: alfa", "Nome: Beta", "Nome: Zulu"]);
  });

  test("create validation and success", async () => {
    renderWithProviders(<Dashboard />);
    await screen.findByText("Nome: Plat 1");
    fireEvent.click(screen.getAllByText("Adicionar plataforma")[0]!.closest("button")!);
    submit();
    await screen.findByText("Informe o nome");
    field("Nome").value = "N";
    submit();
    await screen.findByText("Informe o tipo");
    field("Tipo").value = PLATFORMS[0];
    submit();
    await screen.findByText("Informe a URL");
    // inject an option the app does not know about
    const select = field("Tipo") as HTMLSelectElement;
    select.add(Object.assign(document.createElement("option"), { value: "bogus", text: "bogus" }));
    select.value = "bogus";
    field("URL").value = "https://n.test";
    submit();
    await screen.findByText("Tipo inválido");
    select.value = PLATFORMS[0];
    submit();
    await screen.findByText("Plataforma salva");
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({ name: "N", type: PLATFORMS[0], url: "https://n.test", ignoreSsl: false });

    writeFail = true;
    fireEvent.click(screen.getAllByText("Adicionar plataforma")[0]!.closest("button")!);
    field("Nome").value = "N";
    field("Tipo").value = PLATFORMS[0];
    field("URL").value = "u";
    submit();
    await screen.findByText("Falha ao salvar");
    writeFail = false;
    writeThrow = true;
    submit();
    await waitFor(() => expect(screen.getAllByText("Falha ao salvar").length).toBe(2));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Adicionar plataforma" })).getByText("Cancelar"),
    );
  });

  test("edit flow success and failure", async () => {
    renderWithProviders(<Dashboard />);
    await screen.findByText("Nome: Plat 1");
    fireEvent.click(ctrlBtns("Nome: Plat 1")[0]!);
    expect(field("Nome").value).toBe("Plat 1");
    field("Nome").value = "Renamed";
    submit();
    await screen.findByText("Plataforma atualizada");
    expect(calls.some((c) => c.method === "PATCH" && c.body.name === "Renamed")).toBe(true);
    writeFail = true;
    fireEvent.click(ctrlBtns("Nome: Plat 1")[0]!);
    submit();
    await screen.findByText("Falha ao atualizar");
  });

  test("delete flow: cancel, fail, success", async () => {
    renderWithProviders(<Dashboard />);
    await screen.findByText("Nome: Plat 1");
    fireEvent.click(ctrlBtns("Nome: Plat 1")[1]!);
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByText("Cancelar"),
    );
    await act(async () => {});
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);

    writeFail = true;
    fireEvent.click(ctrlBtns("Nome: Plat 1")[1]!);
    fireEvent.click(await screen.findByText("Excluir"));
    await screen.findByText("Falha ao excluir plataforma");
    writeFail = false;
    fireEvent.click(ctrlBtns("Nome: Plat 1")[1]!);
    fireEvent.click(await screen.findByText("Excluir"));
    await screen.findByText("Plataforma excluída");
  });

  test("external link opens url without opening history", async () => {
    const open = spyOn(window, "open").mockImplementation((() => null) as any);
    renderWithProviders(<Dashboard />);
    await screen.findByText("Nome: Plat 1");
    fireEvent.click(ctrlBtns("Nome: Plat 1")[2]!);
    expect(open).toHaveBeenCalledWith("https://1.test");
    expect(calls.some((c) => c.path.endsWith("/history"))).toBe(false);
    open.mockRestore();
  });

  test("history modal paginates and closes", async () => {
    renderWithProviders(<Dashboard />);
    await screen.findByText("Nome: Plat 1");
    fireEvent.click(screen.getByText("Nome: Plat 1"));
    await screen.findByText("Histórico - Plat 1");
    await waitFor(() => expect(screen.queryByText("Carregando histórico...")).toBeNull());
    for (const t of ["3d", "3h", "4min", "30s"]) expect(screen.getAllByText(new RegExp(`por ${t}`)).length).toBeGreaterThan(0);
    const [newer, older] = screen.getAllByRole("button").filter((b) => b.className.includes("disabled:opacity-30")) as HTMLButtonElement[];
    historyFn = (q) => (q.before ? history({ hasMore: false, nextCursor: null }) : history());
    fireEvent.click(older!);
    await waitFor(() => expect(older!.disabled).toBe(true));
    await waitFor(() => expect(newer!.disabled).toBe(false));
    fireEvent.click(newer!);
    await waitFor(() => expect(newer!.disabled).toBe(true));

    const modal = screen.getByText("Histórico - Plat 1").closest(".fixed") as HTMLElement;
    fireEvent.click(screen.getByText("Histórico - Plat 1"));
    fireEvent.click(modal);
    await waitFor(() => expect(modal.className).toContain("opacity-0"));
  });

  test("history empty, error and no-cursor older", async () => {
    historyFn = () => fail();
    renderWithProviders(<Dashboard />);
    await screen.findByText("Nome: Plat 1");
    fireEvent.click(screen.getByText("Nome: Plat 1"));
    await screen.findByText("Falha ao buscar histórico");
    historyFn = () => history({ checks: [], segments: [], hasMore: true, nextCursor: null });
    fireEvent.click(screen.getByText("Nome: Plat 2"));
    await screen.findByText("Nenhum histórico disponível para este período.");
    const before = calls.length;
    fireEvent.click(screen.getAllByRole("button").filter((b) => b.className.includes("disabled:opacity-30"))[1]!);
    await act(async () => {});
    expect(calls.length).toBe(before);
  });

  test("refresh button success and failure, last checked shown", async () => {
    listReply = rows.map((r) => ({ ...r, lastCheckedAt: "2024-01-01T10:00:00.000Z" }));
    renderWithProviders(<Dashboard />);
    await screen.findByText(/Última verificação/);
    fireEvent.click(screen.getByText("Atualizar"));
    await waitFor(() => expect(screen.getByText("Atualizar").closest("button")!.disabled).toBe(false));
    writeFail = true;
    fireEvent.click(screen.getByText("Atualizar"));
    await screen.findByText("Falha ao atualizar");
  });

  test("polling refreshes", async () => {
    let tick: (() => void) | undefined;
    const orig = globalThis.setInterval;
    globalThis.setInterval = ((fn: () => void) => ((tick ??= fn), 1)) as any;
    renderWithProviders(<Dashboard />);
    globalThis.setInterval = orig;
    await screen.findByText("Nome: Plat 1");
    listReply = [row("9", "OK")];
    await act(async () => tick!());
    await screen.findByText("Nome: Plat 9");
  });
});
