import React from "react";

import { RingPicker } from "@public/components/RingPicker";
import { Slider } from "@public/components/Slider";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, mock, test } from "bun:test";

afterEach(cleanup);

test("Slider: label, change then commit, drag ignores prop updates", () => {
  const onCommit = mock();
  const { container, rerender } = render(
    <Slider value={20} onCommit={onCommit} label="Br" />,
  );
  expect(screen.getByText("Br · 20%")).toBeTruthy();
  const input = container.querySelector("input")!;
  fireEvent.pointerDown(input);
  rerender(<Slider value={50} onCommit={onCommit} label="Br" />);
  expect(screen.getByText("Br · 20%")).toBeTruthy(); // ignored mid-drag
  fireEvent.change(input, { target: { value: "70" } });
  expect(onCommit).toHaveBeenCalledWith(70);
  rerender(<Slider value={90} onCommit={onCommit} label="Br" />);
  expect(screen.getByText("Br · 90%")).toBeTruthy();
});

test("Slider: no label, disabled, custom track/format, degenerate range", () => {
  const { container, rerender } = render(
    <Slider value={1} onCommit={() => {}} min={5} max={5} disabled track="red" formatValue={(v) => `${v}x`} />,
  );
  expect(container.querySelector("span")).toBeNull();
  expect(container.innerHTML).toContain("opacity-50");
  rerender(<Slider value={1} onCommit={() => {}} label="L" formatValue={(v) => `${v}x`} />);
  expect(screen.getByText("L · 1x")).toBeTruthy();
});

beforeEach(() => {
  const p = Element.prototype as any;
  p.setPointerCapture = () => {};
  p.releasePointerCapture = () => {};
  p.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0 });
});

test("RingPicker: pointer down/move/up commits", () => {
  const onCommit = mock();
  render(
    <RingPicker value={0} onCommit={onCommit} colors={["red", "blue"]} label="hue" knobColor="red">
      <span>mid</span>
    </RingPicker>,
  );
  const ring = screen.getByRole("slider");
  fireEvent.pointerMove(ring, { clientX: 90, clientY: 50 }); // not dragging: ignored
  fireEvent.pointerUp(ring, { clientX: 90, clientY: 50 }); // not dragging: ignored
  expect(onCommit).not.toHaveBeenCalled();
  fireEvent.pointerDown(ring, { clientX: 50, clientY: 50 }); // centre: ignored
  expect(onCommit).not.toHaveBeenCalled();
  fireEvent.pointerDown(ring, { clientX: 90, clientY: 50 }); // 3 o'clock = 0.25
  expect(ring.getAttribute("aria-valuenow")).toBe("25");
  fireEvent.pointerMove(ring, { clientX: 50, clientY: 95 }); // 6 o'clock = .5
  expect(ring.getAttribute("aria-valuenow")).toBe("50");
  fireEvent.pointerUp(ring, { clientX: 5, clientY: 50 }); // 9 o'clock .75
  expect(onCommit).toHaveBeenCalledWith(0.75);
  expect(screen.getByText("mid")).toBeTruthy();
});

test("RingPicker: arc sweep, clamping to ends, and no hit when rect missing", () => {
  const onCommit = mock();
  render(
    <RingPicker value={0.5} onCommit={onCommit} colors={["a", "b", "c"]} label="arc" startAngle={45} sweep={270} />,
  );
  const ring = screen.getByRole("slider");
  // angle 0 (12 o'clock): position (0-45+360)%360=315 > 270; nearer end is 0 side (45 vs 270)
  fireEvent.pointerDown(ring, { clientX: 50, clientY: 5 });
  expect(ring.getAttribute("aria-valuenow")).toBe("0");
  // angle ~ 350 -> position 305 -> distance to sweep 35 vs 55 => sweep end
  fireEvent.pointerMove(ring, { clientX: 45, clientY: 5 });
  expect(ring.getAttribute("aria-valuenow")).toBe("100");
  fireEvent.pointerUp(ring, { clientX: 45, clientY: 5 });
  expect(onCommit).toHaveBeenCalledWith(1);
});

test("RingPicker: null rect on up falls back to local; keyboard and disabled", () => {
  const onCommit = mock();
  const { rerender } = render(
    <RingPicker value={0.5} onCommit={onCommit} colors={["a", "b"]} label="k" />,
  );
  const ring = screen.getByRole("slider");
  fireEvent.pointerDown(ring, { clientX: 90, clientY: 50 });
  const orig = (Element.prototype as any).getBoundingClientRect;
  // make boxRef rect undefined
  (Element.prototype as any).getBoundingClientRect = () => undefined;
  fireEvent.pointerMove(ring, { clientX: 1, clientY: 1 });
  fireEvent.pointerUp(ring, { clientX: 1, clientY: 1 });
  expect(onCommit).toHaveBeenLastCalledWith(0.25);
  (Element.prototype as any).getBoundingClientRect = orig;

  fireEvent.keyDown(ring, { key: "ArrowRight" });
  expect(onCommit).toHaveBeenLastCalledWith(0.26);
  fireEvent.keyDown(ring, { key: "ArrowUp" });
  fireEvent.keyDown(ring, { key: "ArrowLeft" });
  fireEvent.keyDown(ring, { key: "ArrowDown" });
  const n = onCommit.mock.calls.length;
  fireEvent.keyDown(ring, { key: "a" });
  expect(onCommit.mock.calls.length).toBe(n);

  rerender(<RingPicker value={0.5} onCommit={onCommit} colors={["a", "b"]} label="k" disabled />);
  fireEvent.keyDown(ring, { key: "ArrowRight" });
  fireEvent.pointerDown(ring, { clientX: 90, clientY: 50 });
  expect(onCommit.mock.calls.length).toBe(n);
  expect(ring.getAttribute("tabindex")).toBe("-1");
});
