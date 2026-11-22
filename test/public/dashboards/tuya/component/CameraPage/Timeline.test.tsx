import React from "react";

import { Timeline } from "@public/dashboards/tuya/component/CameraPage/Timeline";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, mock, test } from "bun:test";

afterEach(cleanup);

// Two hours, local-hour aligned; the default zoom is 8 seconds per pixel.
const START = new Date("2026-11-22T10:00:00").getTime() / 1000;
const END = START + 7200;
const clock = (time: number) => new Date(time * 1000).toLocaleTimeString("pt-BR");

function setup(props: Partial<React.ComponentProps<typeof Timeline>> = {}) {
  const onSeek = mock((_time: number) => {});
  const view = render(
    <Timeline
      start={START}
      end={END}
      motion={[
        { start_time: START + 60, motion: 80 },
        { start_time: END - 30, motion: 0 },
      ]}
      reviews={[
        { id: "a", start_time: START + 100, end_time: START + 200, severity: "alert", data: { objects: ["person", "car"] } },
        { id: "d", start_time: END - 50, end_time: null, severity: "detection" },
      ]}
      recorded={new Set([START])}
      current={null}
      onSeek={onSeek}
      {...props}
    />,
  );
  const track = screen.getByTestId("timeline-track");
  track.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
  return { onSeek, track, slider: screen.getByRole("slider"), ...view };
}

test("draws motion bars, review bands, unrecorded hours and no playhead", () => {
  const { track, slider } = setup();
  expect(track.style.height).toBe("900px");
  expect(screen.getAllByTestId("motion-bar")).toHaveLength(2);
  expect(screen.getByTestId("review-alert").title).toBe("person, car");
  // The open detection runs up to the end of the day.
  expect(screen.getByTestId("review-detection").style.top).toBe("0px");
  // Only the second hour has no recording.
  expect(screen.getAllByTestId("timeline-gap")).toHaveLength(1);
  expect(slider.getAttribute("aria-valuenow")).toBe(String(END));
  expect(slider.getAttribute("aria-valuetext")).toBeNull();
  expect(screen.queryByText(clock(START + 60))).toBeNull();
});

test("click seeks and dragging previews before seeking on release", () => {
  const { onSeek, track } = setup();
  // Moves and releases without a press are ignored.
  fireEvent.pointerMove(track, { clientY: 10 });
  fireEvent.pointerUp(track, { clientY: 10 });
  expect(onSeek).not.toHaveBeenCalled();

  fireEvent.pointerDown(track, { clientY: 100 });
  fireEvent.pointerUp(track, { clientY: 100 });
  expect(onSeek).toHaveBeenLastCalledWith(END - 800);

  fireEvent.pointerDown(track, { clientY: 0 });
  fireEvent.pointerMove(track, { clientY: 200 });
  expect(screen.getByText(clock(END - 1600))).toBeTruthy();
  fireEvent.pointerUp(track, { clientY: 5000 });
  // Clamped to the start of the day.
  expect(onSeek).toHaveBeenLastCalledWith(START);

  // A touch swipe cancels: it scrolls instead of seeking.
  fireEvent.pointerDown(track, { clientY: 50 });
  fireEvent.pointerCancel(track);
  expect(screen.queryByText(clock(END - 400))).toBeNull();
  expect(onSeek).toHaveBeenCalledTimes(2);
});

test("arrow keys step one motion bucket, clamped to the day", () => {
  const { onSeek, slider, rerender } = setup();
  fireEvent.keyDown(slider, { key: "ArrowUp" });
  expect(onSeek).toHaveBeenLastCalledWith(END);
  fireEvent.keyDown(slider, { key: "Enter" });
  expect(onSeek).toHaveBeenCalledTimes(1);
  rerender(
    <Timeline start={START} end={END} motion={[]} reviews={[]} recorded={new Set()} current={START + 600} onSeek={onSeek} />,
  );
  fireEvent.keyDown(slider, { key: "ArrowDown" });
  expect(onSeek).toHaveBeenLastCalledWith(START + 570);
  expect(slider.getAttribute("aria-valuetext")).toBe(clock(START + 600));
});

test("playhead shows the playing time and is scrolled into view", () => {
  const { slider } = setup({ current: START + 600 });
  expect(screen.getByText(clock(START + 600))).toBeTruthy();
  // y = (END - current) / 8 = 825, outside the (empty) viewport at the top.
  expect(slider.scrollTop).toBe(825);
});

test("zoom keeps the anchored time in place and stops at the limits", () => {
  const { track, slider } = setup({ current: START + 600 });
  const zoomOut = screen.getByLabelText("Afastar") as HTMLButtonElement;
  const zoomIn = screen.getByLabelText("Aproximar") as HTMLButtonElement;
  fireEvent.click(zoomIn);
  expect(track.style.height).toBe("1800px");
  expect(zoomIn.disabled).toBe(true);
  expect(slider.scrollTop).toBe(1650);
  for (let i = 0; i < 4; i++) fireEvent.click(zoomOut);
  expect(track.style.height).toBe("120px");
  expect(zoomOut.disabled).toBe(true);
});

test("zoom without a playhead anchors the middle of the view", () => {
  const { track } = setup();
  fireEvent.click(screen.getByLabelText("Afastar"));
  expect(track.style.height).toBe("480px");
});
