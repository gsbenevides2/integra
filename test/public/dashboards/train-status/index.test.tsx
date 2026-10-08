import "@public/components/GlobalDrawerContext"; // load order: avoids dashboard <-> drawer import cycle

import React from "react";

import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";

import { fail, fakeRecharts, useApi } from "../../../helpers/dash-api";
import { renderWithProviders } from "../../../helpers/public-render";

const realRecharts = { ...(await import("recharts")) };
mock.module("recharts", () => fakeRecharts(React));
afterAll(() => mock.module("recharts", () => realRecharts));

const { TrainStatusDashboard, trainStatusDashboard } = await import("@public/dashboards/train-status/index");
const { Card } = await import("@public/dashboards/train-status/component/Card");

const now = Date.now();
const iso = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString();

const lines = [
  { lineCode: 1, lineColor: "x", situation: "Normal", status: "OK", description: null, checkedAt: null },
  { lineCode: 2, lineColor: "x", situation: "Slow", status: "WARNING", description: "slow trains", checkedAt: null },
  { lineCode: 3, lineColor: "x", situation: "Off", status: "CRITICAL", description: "stopped", checkedAt: null },
  { lineCode: 4, lineColor: "x", situation: "?", status: "UNKNOWN", description: null, checkedAt: null },
  { lineCode: 5, lineColor: "x", situation: "new", status: null, description: null, checkedAt: null },
  { lineCode: 99, lineColor: "x", situation: "ghost", status: "OK", description: null, checkedAt: null },
];
const history = (over: object = {}) => ({
  checks: [
    { status: "OK", situation: "Normal", description: null, checkedAt: iso(30) },
    { status: "CRITICAL", situation: "Off", description: null, checkedAt: iso(10) },
  ],
  segments: [
    { status: "OK", situation: "Normal", startedAt: iso(30), endedAt: iso(10), description: null },
    { status: "WARNING", situation: "Slow", startedAt: iso(10), endedAt: null, description: null },
  ],
  hasMore: true,
  nextCursor: "cur1",
  ...over,
});

let linesReply: unknown = lines;
let historyFn: (q: Record<string, string>) => unknown = () => history();
const calls = useApi({
  "GET /api/train-status/lines": () => linesReply,
  "GET /api/train-status/:code/history": ({ query }) => historyFn(query),
});
afterEach(() => {
  cleanup();
  linesReply = lines;
  historyFn = () => history();
});

describe("TrainStatusDashboard", () => {
  test("lists lines, opens/closes history and paginates", async () => {
    renderWithProviders(<TrainStatusDashboard />);
    expect(trainStatusDashboard.id).toBe("train-status");
    await screen.findByText("slow trains");
    fireEvent.click(screen.getByLabelText("Abrir menu"));
    expect(screen.getByText("stopped")).toBeTruthy();
    expect(screen.getByText("Status: Not checked yet")).toBeTruthy();

    fireEvent.click(screen.getByText("Slow"));
    await screen.findByText("History - Line 2");
    await waitFor(() => expect(screen.queryByText("Loading history...")).toBeNull());
    expect(calls.at(-1)!.path).toBe("/api/train-status/2/history");
    expect(screen.getAllByText(/since/).length).toBe(2);

    const [newer, older] = screen.getAllByRole("button").filter((b) => b.className.includes("disabled:opacity-30")) as HTMLButtonElement[];
    expect(newer!.disabled).toBe(true);

    historyFn = (q) => (q.before === "cur1" ? history({ hasMore: false, nextCursor: null }) : history());
    fireEvent.click(older!);
    await waitFor(() => expect(calls.at(-1)!.query.before).toBe("cur1"));
    await waitFor(() => expect(older!.disabled).toBe(true));
    await waitFor(() => expect(newer!.disabled).toBe(false));
    fireEvent.click(newer!);
    await waitFor(() => expect(newer!.disabled).toBe(true));
    expect(calls.at(-1)!.query.before).toBeUndefined();

    // goOlder with no cursor is a no-op
    historyFn = () => history({ hasMore: true, nextCursor: null });
    // overlay click closes; inner click does not
    const modal = screen.getByText("History - Line 2").closest(".fixed") as HTMLElement;
    fireEvent.click(screen.getByText("History - Line 2"));
    fireEvent.click(modal);
    await waitFor(() => expect(modal.className).toContain("opacity-0"));
  });

  test("history empty, error, and cursorless older", async () => {
    historyFn = () => fail();
    renderWithProviders(<TrainStatusDashboard />);
    await screen.findByText("slow trains");
    fireEvent.click(screen.getByText("Slow"));
    await screen.findByText("Failed to fetch history");
    historyFn = () => history({ checks: [], segments: [], hasMore: true, nextCursor: null });
    fireEvent.click(screen.getByText("Off"));
    await screen.findByText("No history available for this period.");
    const older = screen.getAllByRole("button").filter((b) => b.className.includes("disabled:opacity-30"))[1]!;
    fireEvent.click(older);
    const before = calls.length;
    await act(async () => {});
    expect(calls.length).toBe(before);
  });

  test("empty and failing lists", async () => {
    linesReply = [];
    const { unmount } = renderWithProviders(<TrainStatusDashboard />);
    await screen.findByText("No train lines tracked yet");
    unmount();
    linesReply = fail();
    renderWithProviders(<TrainStatusDashboard />);
    await screen.findByText("Failed to fetch train lines");
  });

  test("polls without skeleton", async () => {
    let tick: (() => void) | undefined;
    const orig = globalThis.setInterval;
    globalThis.setInterval = ((fn: () => void) => ((tick ??= fn), 1)) as any;
    renderWithProviders(<TrainStatusDashboard />);
    globalThis.setInterval = orig;
    await screen.findByText("slow trains");
    linesReply = [];
    await act(async () => tick!());
    await screen.findByText("No train lines tracked yet");
  });

  test("Card handles unknown line codes", () => {
    const { container } = renderWithProviders(<Card lineCode={12345} situation="s" status="WARNING" description={null} onOpenHistory={() => {}} />);
    expect(within(container).getByText(/Line 12345/)).toBeTruthy();
  });
});
