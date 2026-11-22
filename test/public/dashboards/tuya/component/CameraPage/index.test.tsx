import React from "react";

import { CameraPage } from "@public/dashboards/tuya/component/CameraPage";

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
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
/** The unix second the recording of a local hour starts at (10:00 by default). */
const hourStart = (hour = "10") =>
  new Date(
    `${new Date().toLocaleDateString("sv")}T${hour}:00:00`,
  ).getTime() / 1000;

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

test("history tab: picks a day and an hour and navigates hours", async () => {
  const today = new Date().toLocaleDateString("sv");
  const hours = (n: number) => [{ hour: "10", events: n, motion: 5, duration: 3600 }, { hour: "09", events: 0, motion: 0, duration: 3600 }];
  open({
    [`GET ${BASE}/recordings/summary`]: () => [
      { day: today, events: 2, hours: hours(2) },
      { day: "2020-01-05", events: 0, hours: hours(0) },
    ],
    [`GET ${BASE}/events`]: () => [event("b", "dog"), event("a", "person")].map((e, i) => ({ ...e, start_time: hourStart() + 100 - i * 10 })),
  });
  tab("Histórico");
  expect(await screen.findByText("Escolha uma hora na linha do tempo")).toBeTruthy();
  expect(screen.getByRole("option", { name: "Hoje" })).toBeTruthy();
  expect((screen.getByLabelText("Hora anterior") as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByLabelText("10h") as HTMLButtonElement).disabled).toBe(false);
  expect((screen.getByLabelText("11h") as HTMLButtonElement).disabled).toBe(true);

  fireEvent.click(screen.getByLabelText("10h"));
  const start = new Date(`${today}T10:00:00`).getTime() / 1000;
  expect(document.querySelector("video")!.getAttribute("src")).toBe(`${BASE}/clip.mp4?start=${start}&end=${start + 3600}`);
  expect(screen.getByText(`Hoje, 10:00 – 10:59`)).toBeTruthy();
  await screen.findByText("Eventos nesta hora");
  const query = m.calls.find((c) => c.query.has("after"))!.query;
  expect([query.get("after"), query.get("before")]).toEqual([String(start), String(start + 3600)]);

  fireEvent.click(screen.getByLabelText("Hora anterior"));
  expect(document.querySelector("video")!.getAttribute("src")).toContain(`start=${start - 3600}`);
  fireEvent.click(screen.getByLabelText("Próxima hora"));
  expect((screen.getByLabelText("Próxima hora") as HTMLButtonElement).disabled).toBe(true);

  fireEvent.click(screen.getByRole("option", { name: /05\/01/ }));
  expect(document.querySelector("video")).toBeNull();
});

// The clip of an hour is a fragmented mp4 piped out of ffmpeg: the browser cannot
// seek in it, so an event is played by asking Frigate for a clip that starts there.
test("history tab: clicking an event reloads the player from the event", async () => {
  const today = new Date().toLocaleDateString("sv");
  const start = new Date(`${today}T10:00:00`).getTime() / 1000;
  open({
    [`GET ${BASE}/recordings/summary`]: () => [
      {
        day: today,
        events: 1,
        hours: [
          { hour: "10", events: 1, motion: 5, duration: 3600 },
          { hour: "09", events: 0, motion: 0, duration: 3600 },
        ],
      },
    ],
    [`GET ${BASE}/events`]: () => [
      { ...event("a", "person"), start_time: start + 40.75 },
    ],
  });
  tab("Histórico");
  fireEvent.click(await screen.findByLabelText("10h"));
  const thumbnail = await screen.findByAltText("person");
  expect(document.querySelector("video")!.getAttribute("src")).toBe(`${BASE}/clip.mp4?start=${start}&end=${start + 3600}`);

  // The fractional start_time Frigate sends is floored: the clip route takes ints.
  fireEvent.click(thumbnail);
  expect(document.querySelector("video")!.getAttribute("src")).toBe(`${BASE}/clip.mp4?start=${start + 40}&end=${start + 3600}`);
  expect(screen.getByText(`Hoje, desde ${new Date((start + 40) * 1000).toLocaleTimeString("pt-BR")}`)).toBeTruthy();
  const selected = thumbnail.closest("button")!;
  expect(selected.getAttribute("aria-current")).toBe("true");
  expect(selected.className).toContain("ring-blue-500");

  // Switching hours drops the event: the next hour plays from its own start.
  fireEvent.click(screen.getByLabelText("Hora anterior"));
  expect(screen.queryByText("Ver a hora inteira")).toBeNull();
  expect(document.querySelector("video")!.getAttribute("src")).toBe(`${BASE}/clip.mp4?start=${start - 3600}&end=${start}`);
  await screen.findByText("Eventos nesta hora");
});

test("history tab: an event clip goes back to the whole hour", async () => {
  const today = new Date().toLocaleDateString("sv");
  const start = new Date(`${today}T10:00:00`).getTime() / 1000;
  open({
    [`GET ${BASE}/recordings/summary`]: () => [
      { day: today, events: 1, hours: [{ hour: "10", events: 1, motion: 5, duration: 3600 }] },
    ],
    [`GET ${BASE}/events`]: () => [
      { ...event("a", "person"), start_time: start + 40 },
    ],
  });
  tab("Histórico");
  fireEvent.click(await screen.findByLabelText("10h"));
  fireEvent.click(await screen.findByAltText("person"));
  expect(screen.getByAltText("person").closest("button")!.getAttribute("aria-current")).toBe("true");

  fireEvent.click(screen.getByText("Ver a hora inteira"));
  expect(document.querySelector("video")!.getAttribute("src")).toBe(`${BASE}/clip.mp4?start=${start}&end=${start + 3600}`);
  expect(screen.getByText("Hoje, 10:00 – 10:59")).toBeTruthy();
  expect(screen.queryByText("Ver a hora inteira")).toBeNull();
  expect(screen.getByAltText("person").closest("button")!.getAttribute("aria-current")).toBe("false");
});

// The event state survives one render after a day/hour change, so an event outside
// the hour on screen must never pick the clip window.
test("history tab: an event outside the selected hour does not move the player", async () => {
  const today = new Date().toLocaleDateString("sv");
  const start = hourStart();
  open({
    [`GET ${BASE}/recordings/summary`]: () => [
      { day: today, events: 1, hours: [{ hour: "10", events: 1, motion: 5, duration: 3600 }] },
    ],
    [`GET ${BASE}/events`]: () => [
      { ...event("a", "person"), start_time: start + 3600 },
    ],
  });
  tab("Histórico");
  fireEvent.click(await screen.findByLabelText("10h"));
  const thumbnail = await screen.findByAltText("person");

  fireEvent.click(thumbnail);
  expect(document.querySelector("video")!.getAttribute("src")).toBe(`${BASE}/clip.mp4?start=${start}&end=${start + 3600}`);
  expect(screen.getByText("Hoje, 10:00 – 10:59")).toBeTruthy();
  expect(screen.queryByText("Ver a hora inteira")).toBeNull();
  expect(thumbnail.closest("button")!.getAttribute("aria-current")).toBe("false");
});

test("history tab labels yesterday and survives failing events", async () => {
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString("sv");
  open({
    [`GET ${BASE}/recordings/summary`]: () => [{ day: yesterday, events: 0, hours: [{ hour: "10", events: 0, motion: 0, duration: 3600 }] }],
    [`GET ${BASE}/events`]: fail,
  });
  tab("Histórico");
  expect(await screen.findByRole("option", { name: "Ontem" })).toBeTruthy();
  fireEvent.click(screen.getByLabelText("10h"));
  await waitFor(() => expect(m.calls.some((c) => c.path === `${BASE}/events`)).toBe(true));
  expect(screen.queryByText("Eventos nesta hora")).toBeNull();
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
