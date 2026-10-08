import "@public/components/GlobalDrawerContext"; // load order: avoids dashboard <-> drawer import cycle

import React from "react";

import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
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
  screen.getByText(label).parentElement!.querySelector("input,select") as HTMLInputElement;
const submit = () => fireEvent.submit(screen.getByText("Save").closest("form")!);
const ctrlBtns = (card: string) =>
  Array.from(screen.getByText(card).closest(".cursor-pointer")!.querySelectorAll("button"));

describe("StatusPlatformDashboard", () => {
  test("metadata, skeleton and cards", async () => {
    const { container } = renderWithProviders(<Dashboard />);
    expect(container.querySelectorAll(".animate-pulse").length).toBe(6);
    await screen.findByText("Name: Plat 1");
    fireEvent.click(screen.getByLabelText("Abrir menu"));
    expect(screen.getByText("Status: Operational")).toBeTruthy();
    expect(screen.getByText("Status: Down")).toBeTruthy();
    expect(screen.getByText("Status: Not checked yet")).toBeTruthy();
    expect(screen.getByText("it broke")).toBeTruthy();
  });

  test("list failure and empty state with add button", async () => {
    listReply = fail();
    const { unmount } = renderWithProviders(<Dashboard />);
    await screen.findByText("Failed to fetch platforms");
    unmount();
    listReply = [];
    renderWithProviders(<Dashboard />);
    await screen.findByText("No platforms registered yet");
    fireEvent.click(screen.getAllByText("Add Platform")[1]!.closest("button")!);
    await screen.findByText("Cancel");
  });

  test("create validation and success", async () => {
    renderWithProviders(<Dashboard />);
    await screen.findByText("Name: Plat 1");
    fireEvent.click(screen.getAllByText("Add Platform")[0]!.closest("button")!);
    submit();
    await screen.findByText("Missing name!");
    field("Name").value = "N";
    submit();
    await screen.findByText("Missing type");
    field("Type").value = PLATFORMS[0];
    submit();
    await screen.findByText("Missing url");
    // inject an option the app does not know about
    const select = field("Type");
    select.add(Object.assign(document.createElement("option"), { value: "bogus", text: "bogus" }));
    select.value = "bogus";
    field("Url").value = "https://n.test";
    submit();
    await screen.findByText("Invalid type");
    select.value = PLATFORMS[0];
    submit();
    await screen.findByText("Saved successfully");
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({ name: "N", type: PLATFORMS[0], url: "https://n.test" });

    writeFail = true;
    fireEvent.click(screen.getAllByText("Add Platform")[0]!.closest("button")!);
    field("Name").value = "N";
    field("Type").value = PLATFORMS[0];
    field("Url").value = "u";
    submit();
    await screen.findByText("Failed to save");
    writeFail = false;
    writeThrow = true;
    submit();
    await waitFor(() => expect(screen.getAllByText("Failed to save").length).toBe(2));
    fireEvent.click(screen.getByText("Cancel"));
  });

  test("edit flow success and failure", async () => {
    renderWithProviders(<Dashboard />);
    await screen.findByText("Name: Plat 1");
    fireEvent.click(ctrlBtns("Name: Plat 1")[0]!);
    expect(field("Name").value).toBe("Plat 1");
    field("Name").value = "Renamed";
    submit();
    await screen.findByText("Platform updated successfully");
    expect(calls.some((c) => c.method === "PATCH" && c.body.name === "Renamed")).toBe(true);
    writeFail = true;
    fireEvent.click(ctrlBtns("Name: Plat 1")[0]!);
    submit();
    await screen.findByText("Failed to update");
  });

  test("delete flow: cancel, fail, success", async () => {
    renderWithProviders(<Dashboard />);
    await screen.findByText("Name: Plat 1");
    fireEvent.click(ctrlBtns("Name: Plat 1")[1]!);
    fireEvent.click(await screen.findByText("Cancelar"));
    await act(async () => {});
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);

    writeFail = true;
    fireEvent.click(ctrlBtns("Name: Plat 1")[1]!);
    fireEvent.click(await screen.findByText("Delete"));
    await screen.findByText("Failed to delete platform");
    writeFail = false;
    fireEvent.click(ctrlBtns("Name: Plat 1")[1]!);
    fireEvent.click(await screen.findByText("Delete"));
    await screen.findByText("Platform deleted successfully");
  });

  test("external link opens url without opening history", async () => {
    const open = spyOn(window, "open").mockImplementation((() => null) as any);
    renderWithProviders(<Dashboard />);
    await screen.findByText("Name: Plat 1");
    fireEvent.click(ctrlBtns("Name: Plat 1")[2]!);
    expect(open).toHaveBeenCalledWith("https://1.test");
    expect(calls.some((c) => c.path.endsWith("/history"))).toBe(false);
    open.mockRestore();
  });

  test("history modal paginates and closes", async () => {
    renderWithProviders(<Dashboard />);
    await screen.findByText("Name: Plat 1");
    fireEvent.click(screen.getByText("Name: Plat 1"));
    await screen.findByText("History - Plat 1");
    await waitFor(() => expect(screen.queryByText("Loading history...")).toBeNull());
    for (const t of ["3d", "3h", "4min", "30s"]) expect(screen.getAllByText(new RegExp(`for ${t}`)).length).toBeGreaterThan(0);
    const [newer, older] = screen.getAllByRole("button").filter((b) => b.className.includes("disabled:opacity-30")) as HTMLButtonElement[];
    historyFn = (q) => (q.before ? history({ hasMore: false, nextCursor: null }) : history());
    fireEvent.click(older!);
    await waitFor(() => expect(older!.disabled).toBe(true));
    await waitFor(() => expect(newer!.disabled).toBe(false));
    fireEvent.click(newer!);
    await waitFor(() => expect(newer!.disabled).toBe(true));

    const modal = screen.getByText("History - Plat 1").closest(".fixed") as HTMLElement;
    fireEvent.click(screen.getByText("History - Plat 1"));
    fireEvent.click(modal);
    await waitFor(() => expect(modal.className).toContain("opacity-0"));
  });

  test("history empty, error and no-cursor older", async () => {
    historyFn = () => fail();
    renderWithProviders(<Dashboard />);
    await screen.findByText("Name: Plat 1");
    fireEvent.click(screen.getByText("Name: Plat 1"));
    await screen.findByText("Failed to fetch history");
    historyFn = () => history({ checks: [], segments: [], hasMore: true, nextCursor: null });
    fireEvent.click(screen.getByText("Name: Plat 2"));
    await screen.findByText("No history available for this period.");
    const before = calls.length;
    fireEvent.click(screen.getAllByRole("button").filter((b) => b.className.includes("disabled:opacity-30"))[1]!);
    await act(async () => {});
    expect(calls.length).toBe(before);
  });

  test("polling refreshes", async () => {
    let tick: (() => void) | undefined;
    const orig = globalThis.setInterval;
    globalThis.setInterval = ((fn: () => void) => ((tick ??= fn), 1)) as any;
    renderWithProviders(<Dashboard />);
    globalThis.setInterval = orig;
    await screen.findByText("Name: Plat 1");
    listReply = [row("9", "OK")];
    await act(async () => tick!());
    await screen.findByText("Name: Plat 9");
  });
});
