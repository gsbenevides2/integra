import React, { useRef } from "react";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "bun:test";

const { STICK_THRESHOLD_PX, useStickToBottom } = await import(
  "@public/dashboards/voice-assistant/useStickToBottom"
);

afterEach(cleanup);

function List({ items, show = true }: { items: string[]; show?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useStickToBottom(ref, items.length);
  if (!show) return null;
  return (
    <div ref={ref} data-testid="list">
      {items.map((item, index) => (
        <p key={index}>{item}</p>
      ))}
    </div>
  );
}

/** happy-dom has no layout: give the list a fixed viewport and a content height. */
function layout(list: HTMLElement, content: { height: number }) {
  Object.defineProperty(list, "clientHeight", { configurable: true, value: 100 });
  Object.defineProperty(list, "scrollHeight", { configurable: true, get: () => content.height });
}
/** Past the next animation frame, when following scrolls happen. */
const flush = () => act(() => new Promise((r) => setTimeout(r, 30)));
const scrollTo = (list: HTMLElement, top: number) => {
  list.scrollTop = top;
  fireEvent.scroll(list);
};

describe("useStickToBottom", () => {
  test("follows growing content and new messages, unless the user scrolled up", async () => {
    const { rerender } = render(<List items={["a"]} />);
    const list = screen.getByTestId("list");
    const content = { height: 500 };
    layout(list, content);

    // Text typed into the last message.
    list.querySelector("p")!.textContent = "a, b";
    await flush();
    expect(list.scrollTop).toBe(500);

    // An image finishing loading.
    content.height = 800;
    list.querySelector("p")!.dispatchEvent(new Event("load"));
    list.querySelector("p")!.dispatchEvent(new Event("load")); // same frame
    await flush();
    expect(list.scrollTop).toBe(800);

    // Scrolled up to read: growth no longer pulls the view down.
    scrollTo(list, 800 - 100 - STICK_THRESHOLD_PX - 1);
    content.height = 900;
    list.querySelector("p")!.textContent = "a, b, c";
    await flush();
    expect(list.scrollTop).toBe(651);

    // Back near the end: following again.
    scrollTo(list, 900 - 100 - STICK_THRESHOLD_PX);
    content.height = 1000;
    list.querySelector("p")!.textContent = "a, b, c, d";
    await flush();
    expect(list.scrollTop).toBe(1000);

    // A new message always brings the view to the end.
    scrollTo(list, 0);
    content.height = 1200;
    rerender(<List items={["a", "b"]} />);
    expect(list.scrollTop).toBe(1200);
  });

  test("does nothing without a list", () => {
    const { unmount } = render(<List items={["a"]} show={false} />);
    unmount();
  });
});
