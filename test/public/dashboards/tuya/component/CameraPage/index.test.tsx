import React from "react";

import { ToastProvider } from "@public/components/Toast";
import { CameraPage } from "@public/dashboards/tuya/component/CameraPage";
import { ControlsTab } from "@public/dashboards/tuya/component/CameraPage/ControlsTab";
import { HistoryTab } from "@public/dashboards/tuya/component/CameraPage/HistoryTab";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, mock, test } from "bun:test";

import { fail, mockTuyaFetch } from "../../../../../helpers/tuya-fetch";
import { renderTuya } from "../../../../../helpers/tuya-render";

let m: ReturnType<typeof mockTuyaFetch>;
afterEach(() => {
  cleanup();
  m?.restore();
});

const BASE = "/api/frigate/cameras/cam";
const state = {
  ptz: { features: ["pt"], presets: ["1", "100"] },
  features: { detect: true, recordings: false, snapshots: false, audio: false, ptz_autotracker: false },
};
const event = (id: string, label: string, has_clip = true) => ({
  id,
  label,
  start_time: 1700000000,
  end_time: id === "live" ? null : 1700000005,
  zones: id === "e0" ? ["porta"] : [],
  has_clip,
  has_snapshot: id !== "e0",
});

function open(routes: Parameters<typeof mockTuyaFetch>[0] = {}) {
  m = mockTuyaFetch({ [`GET ${BASE}/state`]: () => state, ...routes });
  const onBack = mock(() => {});
  renderTuya(<CameraPage name="cam" onBack={onBack} />);
  return onBack;
}
const tab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));

test("live tab: back, mute toggle, hold-to-move ptz and presets", async () => {
  const onBack = open({ [`POST ${BASE}/ptz`]: () => ({ ok: true }) });
  fireEvent.click(screen.getByLabelText("Voltar"));
  expect(onBack).toHaveBeenCalled();

  fireEvent.click(screen.getByLabelText("Ativar áudio"));
  expect(screen.getByLabelText("Silenciar")).toBeTruthy();
  fireEvent.click(screen.getByLabelText("Ressincronizar"));

  const left = await screen.findByLabelText("Esquerda");
  fireEvent.pointerDown(left);
  fireEvent.pointerUp(left);
  fireEvent.pointerLeave(left, { buttons: 1 });
  fireEvent.pointerLeave(left, { buttons: 0 });
  fireEvent.pointerCancel(left);
  fireEvent.click(screen.getByText("Posição 100"));
  await waitFor(() =>
    expect(m.calls.filter((c) => c.path === `${BASE}/ptz`).map((c) => c.body.command)).toEqual([
      "MOVE_LEFT",
      "STOP",
      "STOP",
      "STOP",
      "preset_100",
    ]),
  );
});

test("live tab lists the last events, plays one and goes back to live", async () => {
  open({
    [`GET ${BASE}/events`]: () => [event("a", "person"), event("b", "dog", false)],
  });
  const clip = await screen.findByAltText("person");
  expect(m.calls.find((c) => c.path === `${BASE}/events`)!.query.get("limit")).toBe("12");
  expect((screen.getByAltText("dog").closest("button") as HTMLButtonElement).disabled).toBe(true);

  fireEvent.click(clip);
  expect(document.querySelector("video")!.getAttribute("src")).toBe(`${BASE}/events/a/clip.mp4`);
  expect(screen.queryByLabelText("Ativar áudio")).toBeNull();
  fireEvent.click(screen.getByText("Voltar ao vivo"));
  expect(document.querySelector("video")!.getAttribute("src")).toBe(`${BASE}/stream?audio=1`);
});

test("live tab keeps the last events in the right column, not under the video", async () => {
  open({
    [`GET ${BASE}/events`]: () => [event("a", "person")],
  });
  const thumbnail = await screen.findByAltText("person");
  expect(thumbnail.closest("aside")).toBeTruthy();
  expect(screen.getByText("Últimos eventos")).toBeTruthy();
});

test("live tab shows an empty events panel when the camera has no events", async () => {
  open({ [`GET ${BASE}/events`]: () => [] });
  await screen.findByText("Nenhum evento recente.");
});

test("live tab renders a ptz camera that has no presets", async () => {
  m = mockTuyaFetch({
    [`GET ${BASE}/state`]: () => ({ ptz: { features: ["pt"] }, features: {} }),
  });
  renderTuya(<CameraPage name="cam" onBack={() => {}} />);
  await screen.findByText("Controle PTZ");
  expect(screen.queryByText("Posições salvas")).toBeNull();
});

test("live tab hides ptz when the state fails", async () => {
  m = mockTuyaFetch({ [`GET ${BASE}/state`]: fail });
  renderTuya(<CameraPage name="cam" onBack={() => {}} />);
  await waitFor(() => expect(m.calls.length).toBe(1));
  expect(screen.queryByText("PTZ")).toBeNull();
});

test("live tab reports ptz failures", async () => {
  open({ [`POST ${BASE}/ptz`]: fail });
  fireEvent.pointerDown(await screen.findByLabelText("Cima"));
  await screen.findByText("Falha ao enviar comando PTZ");
});

test("events tab lists, filters, paginates and shows an event in a drawer", async () => {
  const page = Array.from({ length: 30 }, (_, i) => event(`e${i}`, i === 1 ? "car" : "person", i !== 1));
  open({
    [`GET ${BASE}/events`]: (call) =>
      call.query.get("before") ? [event("old", "dog")] : call.query.get("label") === "car" ? [event("c", "car")] : page,
  });
  tab("Eventos");
  await screen.findAllByAltText("person");

  // e0: clip only, with a zone and a duration, newest so no "more recent".
  fireEvent.click(screen.getAllByAltText("person")[0]!);
  expect(document.querySelector("video")!.getAttribute("src")).toBe(`${BASE}/events/e0/clip.mp4`);
  expect(screen.getByText("5 s")).toBeTruthy();
  expect(screen.getByText("porta")).toBeTruthy();
  expect(screen.queryByRole("tab", { name: "Snapshot" })).toBeNull();
  expect(screen.getByLabelText("Baixar clipe").getAttribute("download")).toBe("cam-e0.mp4");
  expect((screen.getByLabelText("Evento mais recente") as HTMLButtonElement).disabled).toBe(true);

  // e1: no clip, falls back to its snapshot.
  fireEvent.click(screen.getByLabelText("Evento mais antigo"));
  expect(document.querySelector("video")).toBeNull();
  expect(document.querySelector("img[src$='e1/snapshot.jpg']")).toBeTruthy();
  expect(screen.queryByLabelText("Baixar clipe")).toBeNull();

  // e2 has both: switch between clip and snapshot.
  fireEvent.click(screen.getByLabelText("Evento mais antigo"));
  fireEvent.click(screen.getByRole("tab", { name: "Snapshot" }));
  expect(document.querySelector("img[src$='e2/snapshot.jpg']")).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "Clipe" }));
  expect(document.querySelector("video")).toBeTruthy();
  fireEvent.click(screen.getByLabelText("Evento mais recente"));
  fireEvent.click(screen.getAllByLabelText("Fechar")[0]!);

  fireEvent.click(screen.getByText("Carregar mais"));
  await screen.findByAltText("dog");
  expect(m.calls.at(-1)!.query.get("before")).toBe("1700000000");

  fireEvent.change(screen.getByLabelText("Filtrar por tipo"), { target: { value: "car" } });
  await waitFor(() => expect(m.calls.at(-1)!.query.get("label")).toBe("car"));
  await waitFor(() => expect(screen.queryByAltText("dog")).toBeNull());
});

test("event drawer shows thumbnail when there is neither clip nor snapshot, and open events", async () => {
  open({
    [`GET ${BASE}/events`]: () => [{ ...event("live", "person", false), has_snapshot: false }],
  });
  tab("Eventos");
  fireEvent.click(await screen.findByAltText("person"));
  expect(screen.getByText("Em andamento")).toBeTruthy();
  expect(screen.getByText("—")).toBeTruthy();
  expect(document.querySelector("img[src$='live/thumbnail.jpg']")).toBeTruthy();
});

test("events tab empty when the request fails", async () => {
  open({ [`GET ${BASE}/events`]: fail });
  tab("Eventos");
  await screen.findByText("Nenhum evento.");
});

const clock = (time: number) => new Date(time * 1000).toLocaleTimeString("pt-BR");
const unix = (iso: string) => new Date(iso).getTime() / 1000;
/** Taps the timeline at `time` (8 s/px, newest at the top of the day). */
function tapTimeline(time: number, dayEnd: number) {
  const track = screen.getByTestId("timeline-track");
  track.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
  const clientY = (dayEnd - time) / 8;
  fireEvent.pointerDown(track, { clientY });
  fireEvent.pointerUp(track, { clientY });
}

test("history tab: seeks on the timeline, plays hour after hour and seeks to events", async () => {
  const today = new Date().toLocaleDateString("sv");
  const nine = unix("2020-01-05T09:00:00");
  const dayEnd = unix("2020-01-06T00:00:00");
  const hours = ["10", "09", "07"].map((hour) => ({ hour, events: 0, motion: 0, duration: 3600 }));
  open({
    [`GET ${BASE}/recordings/summary`]: () => [
      { day: "2020-01-05", events: 1, hours },
      { day: today, events: 0, hours: [] },
    ],
    [`GET ${BASE}/motion`]: () => [{ start_time: nine + 60, motion: 50 }],
    [`GET ${BASE}/review`]: () => [{ id: "r", start_time: nine + 90, end_time: nine + 120, severity: "alert" }],
    // Frigate's start times are fractional; clips take whole seconds.
    [`GET ${BASE}/events`]: () => [event("b", "dog"), event("a", "person")].map((e, i) => ({ ...e, start_time: nine + 200.7 - i * 100 })),
  });
  tab("Histórico");
  expect(await screen.findByText("Escolha um momento na linha do tempo")).toBeTruthy();
  expect(screen.getByRole("option", { name: "Hoje" })).toBeTruthy();
  await waitFor(() => expect(screen.getAllByTestId("motion-bar")).toHaveLength(1));
  expect(screen.getByTestId("review-alert")).toBeTruthy();
  const motion = m.calls.find((c) => c.path === `${BASE}/motion`)!.query;
  expect([motion.get("after"), motion.get("before"), motion.get("scale")]).toEqual([String(unix("2020-01-05T00:00:00")), String(dayEnd), "30"]);
  expect(m.calls.find((c) => c.path === `${BASE}/review`)!.query.get("before")).toBe(String(dayEnd));

  // Tapping 09:10 loads a clip starting right there.
  const src = () => document.querySelector("video")!.getAttribute("src");
  tapTimeline(nine + 600, dayEnd);
  expect(src()).toBe(`${BASE}/clip.mp4?start=${nine + 600}&end=${nine + 1200}`);
  const player = document.querySelector("video")!;
  player.currentTime = 100;
  fireEvent.timeUpdate(player);
  expect(screen.getByText(`dom., 05/01, ${clock(nine + 700)}`)).toBeTruthy();

  await screen.findByText("Eventos nesta hora");
  const events = m.calls.find((c) => c.path === `${BASE}/events` && c.query.has("after"))!.query;
  expect([events.get("after"), events.get("before")]).toEqual([String(nine), String(nine + 3600)]);

  // An event starts a clip at its start; its end chains the next 10 minutes.
  fireEvent.click(screen.getByAltText("person"));
  expect(src()).toContain(`start=${nine + 100}&`);
  expect(screen.getByAltText("person").closest("button")!.getAttribute("aria-current")).toBe("true");
  expect(screen.getByAltText("dog").closest("button")!.hasAttribute("aria-current")).toBe(false);
  fireEvent.ended(document.querySelector("video")!);
  expect(src()).toContain(`start=${nine + 700}&`);

  // From 07:55 the next clip would fall in 08h, which has no recordings: it jumps to 09h.
  tapTimeline(nine - 3600 - 300, dayEnd);
  fireEvent.ended(document.querySelector("video")!);
  expect(src()).toContain(`start=${nine}&`);

  // After the last recorded hour there is nothing to chain.
  tapTimeline(nine + 3600 + 3300, dayEnd);
  const last = document.querySelector("video")!;
  fireEvent.ended(last);
  expect(document.querySelector("video")).toBe(last);

  // An hour without recordings says so instead of playing.
  tapTimeline(unix("2020-01-05T05:00:00"), dayEnd);
  expect(screen.getByText("Sem gravação neste horário")).toBeTruthy();
  expect(document.querySelector("video")).toBeNull();

  fireEvent.click(screen.getByRole("option", { name: "Hoje" }));
  expect(await screen.findByText("Escolha um momento na linha do tempo")).toBeTruthy();
});

test("history tab labels yesterday and survives failing requests", async () => {
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString("sv");
  const ten = unix(`${yesterday}T10:00:00`);
  open({
    [`GET ${BASE}/recordings/summary`]: () => [{ day: yesterday, events: 0, hours: [{ hour: "10", events: 0, motion: 0, duration: 3600 }] }],
    [`GET ${BASE}/motion`]: fail,
    [`GET ${BASE}/review`]: fail,
    [`GET ${BASE}/events`]: fail,
  });
  tab("Histórico");
  expect(await screen.findByRole("option", { name: "Ontem" })).toBeTruthy();
  tapTimeline(ten + 60, unix(`${new Date().toLocaleDateString("sv")}T00:00:00`));
  expect(document.querySelector("video")!.getAttribute("src")).toContain(`start=${ten + 60}&`);
  await waitFor(() => expect(m.calls.some((c) => c.path === `${BASE}/events` && c.query.has("after"))).toBe(true));
  expect(screen.queryByText("Eventos nesta hora")).toBeNull();
  expect(screen.queryAllByTestId("motion-bar")).toHaveLength(0);
});

test("history tab drops a late answer for the day it left", async () => {
  const hours = [{ hour: "10", events: 0, motion: 0, duration: 3600 }];
  let answer!: (value: unknown) => void;
  open({
    [`GET ${BASE}/recordings/summary`]: () => [
      { day: "2020-01-05", events: 0, hours },
      { day: "2020-01-04", events: 0, hours },
    ],
    [`GET ${BASE}/motion`]: (call) =>
      call.query.get("after") === String(unix("2020-01-05T00:00:00")) ? new Promise((resolve) => (answer = resolve)) : [],
    [`GET ${BASE}/review`]: () => [],
    [`GET ${BASE}/events`]: (call) => (call.query.get("after") === String(unix("2020-01-05T10:00:00")) ? new Promise(() => {}) : []),
  });
  tab("Histórico");
  await screen.findByText("Escolha um momento na linha do tempo");
  // Loads 10h of the first day, whose events never answer, then leaves it.
  tapTimeline(unix("2020-01-05T10:30:00"), unix("2020-01-06T00:00:00"));
  fireEvent.click(screen.getByRole("option", { name: /04\/01/ }));
  await waitFor(() => expect(m.calls.filter((c) => c.path === `${BASE}/motion`)).toHaveLength(2));
  answer([{ start_time: unix("2020-01-05T10:00:00"), motion: 90 }]);
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(screen.queryAllByTestId("motion-bar")).toHaveLength(0);
});

test("history tab: a network failure reads as no recordings", async () => {
  open({
    [`GET ${BASE}/recordings/summary`]: () => {
      throw new TypeError("offline");
    },
  });
  tab("Histórico");
  await screen.findByText("Sem gravações.");
});

test("history tab: a late summary of the previous camera is dropped", async () => {
  let answer!: (value: unknown) => void;
  m = mockTuyaFetch({
    [`GET /api/frigate/cameras/old/recordings/summary`]: () => new Promise((resolve) => (answer = resolve)),
    [`GET ${BASE}/recordings/summary`]: () => [],
  });
  const view = render(<HistoryTab name="old" />);
  view.rerender(<HistoryTab name="cam" />);
  await screen.findByText("Sem gravações.");
  answer([{ day: "2020-01-05", events: 0, hours: [] }]);
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(screen.getByText("Sem gravações.")).toBeTruthy();
});

test("history tab: switching cameras stops the previous camera's playback", async () => {
  const day = [{ day: "2020-01-05", events: 0, hours: [{ hour: "10", events: 0, motion: 0, duration: 3600 }] }];
  m = mockTuyaFetch({
    [`GET /api/frigate/cameras/old/recordings/summary`]: () => day,
    [`GET ${BASE}/recordings/summary`]: () => day,
  });
  const view = render(<HistoryTab name="old" />);
  await screen.findByText("Escolha um momento na linha do tempo");
  tapTimeline(unix("2020-01-05T10:30:00"), unix("2020-01-06T00:00:00"));
  expect(document.querySelector("video")!.getAttribute("src")).toContain("/cameras/old/");
  view.rerender(<HistoryTab name="cam" />);
  expect(await screen.findByText("Escolha um momento na linha do tempo")).toBeTruthy();
  expect(document.querySelector("video")).toBeNull();
});

test("controls tab: a new state from the server replaces the local toggles", async () => {
  m = mockTuyaFetch({ [`PUT ${BASE}/features/audio`]: () => ({ ok: true }) });
  const ui = (features: typeof state.features) => (
    <ToastProvider>
      <ControlsTab name="cam" state={{ ...state, features }} />
    </ToastProvider>
  );
  const view = render(ui(state.features));
  const audio = () => screen.getByRole("switch", { name: "Detecção de áudio" });
  fireEvent.click(audio());
  await waitFor(() => expect(audio().getAttribute("aria-checked")).toBe("true"));
  view.rerender(ui({ ...state.features, audio: false }));
  expect(audio().getAttribute("aria-checked")).toBe("false");
});

test("history tab: no recordings", async () => {
  open({ [`GET ${BASE}/recordings/summary`]: fail });
  tab("Histórico");
  await screen.findByText("Sem gravações.");
});

test("controls tab toggles features and rolls back on failure", async () => {
  open({
    [`PUT ${BASE}/features/audio`]: () => ({ ok: true }),
    [`PUT ${BASE}/features/detect`]: fail,
  });
  tab("Controles");
  const audio = await screen.findByRole("switch", { name: "Detecção de áudio" });
  expect(audio.getAttribute("aria-checked")).toBe("false");
  fireEvent.click(audio);
  await waitFor(() => expect(audio.getAttribute("aria-checked")).toBe("true"));
  expect(m.calls.find((c) => c.path === `${BASE}/features/audio`)!.body).toEqual({ value: true });

  const detect = screen.getByRole("switch", { name: "Detecção de objetos" });
  fireEvent.click(detect);
  await screen.findByText("Falha ao alterar");
  expect(detect.getAttribute("aria-checked")).toBe("true");
});

test("controls tab waits for the state", () => {
  m = mockTuyaFetch({ [`GET ${BASE}/state`]: () => new Promise(() => {}) as never });
  renderTuya(<CameraPage name="cam" onBack={() => {}} />);
  tab("Controles");
  expect(screen.getByText("Carregando...")).toBeTruthy();
});

test("history tab asks for the summary in the viewer's timezone", async () => {
  open({ [`GET ${BASE}/recordings/summary`]: () => [] });
  tab("Histórico");
  await screen.findByText("Sem gravações.");
  expect(m.calls.find((c) => c.path.endsWith("/summary"))!.query.get("timezone")).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
});
