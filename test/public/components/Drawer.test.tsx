import React from "react";

import { Drawer } from "@public/components/Drawer";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";

afterEach(cleanup);

function touch(type: "touchstart" | "touchend", x: number, y: number) {
  const e: any = new Event(type);
  const list = [{ clientX: x, clientY: y }];
  e.touches = list;
  e.changedTouches = list;
  window.dispatchEvent(e);
}
function swipe(x0: number, x1: number, y0 = 100, y1 = 100) {
  touch("touchstart", x0, y0);
  touch("touchend", x1, y1);
}

let now = 1_000_000;
spyOn(Date, "now").mockImplementation(() => now);

beforeEach(() => {
  now += 10_000; // clear the shared close cooldown between tests
  (window as any).innerWidth = 1000;
});

test("renders title, children, classes per direction/size, close handlers", () => {
  const onClose = mock();
  const { rerender, container } = render(
    <Drawer isOpen onClose={onClose} title="Ttl" size="small" direction="left" removePadding>
      <p>kid</p>
    </Drawer>,
  );
  expect(screen.getByText("Ttl")).toBeTruthy();
  expect(container.innerHTML).toContain("max-w-90");
  expect(container.innerHTML).toContain("left-0");
  fireEvent.click(screen.getByLabelText("Fechar"));
  fireEvent.click(container.querySelector(".bg-black\\/50")!);
  expect(onClose).toHaveBeenCalledTimes(2);

  rerender(<Drawer isOpen={false} onClose={onClose} size="large">x</Drawer>);
  expect(container.innerHTML).toContain("max-w-xl");
  expect(container.innerHTML).toContain("translate-x-full");
  rerender(<Drawer isOpen={false} onClose={onClose} direction="left">x</Drawer>);
  expect(container.innerHTML).toContain("-translate-x-full");
  expect(container.innerHTML).toContain("max-w-md");
});

test("no listeners without swipe props", () => {
  const onClose = mock();
  render(<Drawer isOpen onClose={onClose}>x</Drawer>);
  swipe(500, 100);
  expect(onClose).not.toHaveBeenCalled();
});

test("left drawer swipe open from edge, rejects bad swipes", () => {
  const onOpen = mock();
  const onClose = mock();
  const { unmount } = render(
    <Drawer isOpen={false} onClose={onClose} onOpen={onOpen} enableSwipeOpen direction="left">x</Drawer>,
  );
  touch("touchend", 0, 0); // end without start
  swipe(10, 200); // too close to the edge
  swipe(50, 80); // too short
  swipe(50, 200, 0, 200); // too vertical
  swipe(50, 200, 100, 100); // wrong... close swipe handler disabled; fine
  expect(onOpen).toHaveBeenCalledTimes(1);
  swipe(200, 50); // swipe left, not open
  swipe(300, 600); // gap 300 > EDGE_MAX
  expect(onOpen).toHaveBeenCalledTimes(1);
  unmount();
});

test("right drawer swipe open and swipe close", () => {
  const onOpen = mock();
  const onClose = mock();
  const { rerender } = render(
    <Drawer isOpen={false} onClose={onClose} onOpen={onOpen} enableSwipeOpen enableSwipeClose>x</Drawer>,
  );
  swipe(950, 700);
  expect(onOpen).toHaveBeenCalledTimes(1);
  rerender(<Drawer isOpen onClose={onClose} onOpen={onOpen} enableSwipeOpen enableSwipeClose>x</Drawer>);
  swipe(700, 500); // wrong direction for close
  expect(onClose).not.toHaveBeenCalled();
  swipe(700, 950);
  expect(onClose).toHaveBeenCalledTimes(1);
  // closing set the cooldown: a swipe-open right after is blocked
  rerender(<Drawer isOpen={false} onClose={onClose} onOpen={onOpen} enableSwipeOpen enableSwipeClose>x</Drawer>);
  swipe(950, 700);
  expect(onOpen).toHaveBeenCalledTimes(1);
});

test("another open drawer blocks swipe open", () => {
  const onOpen = mock();
  const other = render(<Drawer isOpen onClose={() => {}}>o</Drawer>);
  const rec = render(
    <Drawer isOpen={false} onClose={() => {}} onOpen={onOpen} enableSwipeOpen direction="left">x</Drawer>,
  );
  swipe(50, 200);
  expect(onOpen).not.toHaveBeenCalled();
  other.unmount();
  rec.unmount();
});
