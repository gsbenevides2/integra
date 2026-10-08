import "@public/components/GlobalDrawerContext"; // load order: avoids dashboard <-> drawer import cycle

import { CronsDashboard, cronsDashboard } from "@public/dashboards/crons/index";

import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { fail, useApi } from "../../../helpers/dash-api";
import { renderWithProviders } from "../../../helpers/public-render";

const job = (name: string) => ({
  name,
  label: `Label ${name}`,
  schedule: "* * * * *",
  scheduleLabel: `every ${name}`,
});

let list: unknown = { ok: true, jobs: [job("a"), job("b"), job("c"), job("d")] };
let release: (() => void) | undefined;
const calls = useApi({
  "GET /api/crons/list": () => (list === "fail" ? fail() : list),
  "POST /api/crons/run/:jobName": async ({ path }) => {
    const name = path.split("/").pop();
    if (name === "a") return { ok: true, elapsed: 42 };
    if (name === "b") return fail(500, { message: "kaput" });
    if (name === "c") return { ok: false, error: "bad job" };
    if (name === "d") return { ok: false };
    await new Promise<void>((r) => (release = r));
    return { ok: true, elapsed: 1 };
  },
});
afterEach(() => cleanup());

describe("CronsDashboard", () => {
  test("metadata", () => {
    expect(cronsDashboard.id).toBe("crons");
  });

  test("runs jobs covering every result branch", async () => {
    renderWithProviders(<CronsDashboard />);
    expect(screen.getByText("Carregando crons...")).toBeTruthy();
    await screen.findByText("Label a");
    fireEvent.click(screen.getByLabelText("Abrir menu"));
    expect(screen.getAllByText("—").length).toBe(4);
    const run = () => screen.getAllByText("Executar").map((t) => t.closest("button")!);

    fireEvent.click(run()[0]!);
    await screen.findByText("Label a concluído em 42ms");
    await screen.findByText(/OK —/);

    fireEvent.click(run()[1]!);
    await screen.findByText("Falha ao executar Label b");
    fireEvent.click(run()[2]!);
    await screen.findByText("bad job");
    fireEvent.click(run()[3]!);
    await screen.findByText("Falha ao executar Label d");
    expect(screen.getAllByText("Erro").length).toBe(3);
    expect(calls.filter((c) => c.method === "POST").length).toBe(4);
  });

  test("shows running state while a job is in flight", async () => {
    list = { ok: true, jobs: [job("slow")] };
    renderWithProviders(<CronsDashboard />);
    await screen.findByText("Label slow");
    fireEvent.click(screen.getByText("Executar").closest("button")!);
    await screen.findByText("Executando...");
    await act(async () => release!());
    await screen.findByText("Label slow concluído em 1ms");
  });

  test("empty list, ok:false list and list failure", async () => {
    list = { ok: true };
    const { unmount } = renderWithProviders(<CronsDashboard />);
    await screen.findByText("Nenhum cron registrado");
    unmount();

    list = { ok: false };
    const second = renderWithProviders(<CronsDashboard />);
    await screen.findByText("Nenhum cron registrado");
    second.unmount();

    list = "fail";
    renderWithProviders(<CronsDashboard />);
    await screen.findByText("Falha ao buscar crons");
  });

  test("polls without the loading state", async () => {
    list = { ok: true, jobs: [job("a")] };
    let tick: (() => void) | undefined;
    const spy = spyOn(globalThis, "setInterval").mockImplementation(((fn: () => void) => {
      tick ??= fn; // waitFor also uses setInterval; keep the component's
      return 1;
    }) as any);
    renderWithProviders(<CronsDashboard />);
    await screen.findByText("Label a");
    spy.mockRestore();
    list = { ok: true, jobs: [job("a"), job("z")] };
    await act(async () => tick!());
    await waitFor(() => screen.getByText("Label z"));
  });
});
