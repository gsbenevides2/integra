import React from "react";

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "bun:test";

const { MAX_TYPING_LAG, TYPING_INTERVAL_MS, TypedText } = await import(
  "@public/components/VoiceAssistantContext/TypedText"
);

afterEach(cleanup);
const tick = () => act(() => new Promise((r) => setTimeout(r, TYPING_INTERVAL_MS)));
async function until(check: () => boolean) {
  for (let i = 0; i < 200 && !check(); i++) await tick();
  expect(check()).toBe(true);
}
const shown = () => screen.getByTestId("text").textContent ?? "";

describe("TypedText", () => {
  test("history (not live) shows the whole text at once", () => {
    render(
      <span data-testid="text">
        <TypedText text="Olá, tudo bem?" />
      </span>,
    );
    expect(shown()).toBe("Olá, tudo bem?");
  });

  test("a live reply types in character by character, following new text", async () => {
    const { rerender } = render(
      <span data-testid="text">
        <TypedText text="Oi" live />
      </span>,
    );
    expect(shown()).toBe("");
    await until(() => shown() === "O");
    await until(() => shown() === "Oi");
    rerender(
      <span data-testid="text">
        <TypedText text="Oi, Gui" live={false} />
      </span>,
    );
    // Keeps typing the new text: the live decision is made once.
    expect(shown()).toBe("Oi");
    await until(() => shown() === "Oi,");
    await until(() => shown() === "Oi, Gui");
  });

  test("speeds up when far behind", async () => {
    const long = "a".repeat(MAX_TYPING_LAG * 4);
    render(
      <span data-testid="text">
        <TypedText text={long} live />
      </span>,
    );
    await until(() => shown().length > 0);
    // Four times the lag behind: four characters per tick instead of one.
    expect(shown().length).toBe(4);
  });
});
