import { registerServiceWorker } from "@public/registerServiceWorker";

import { afterEach, expect, mock, spyOn, test } from "bun:test";

const nav = navigator as any;
const original = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
function setReady(state: string) {
  Object.defineProperty(document, "readyState", { value: state, configurable: true });
}
afterEach(() => {
  if (original) Object.defineProperty(navigator, "serviceWorker", original);
  else delete nav.serviceWorker;
  delete (document as any).readyState;
});

test("does nothing without serviceWorker support", () => {
  delete nav.serviceWorker;
  const add = spyOn(window, "addEventListener");
  registerServiceWorker();
  expect(add).not.toHaveBeenCalled();
  add.mockRestore();
});

test("registers immediately when the page is loaded", () => {
  const register = mock(() => Promise.resolve());
  Object.defineProperty(navigator, "serviceWorker", { value: { register }, configurable: true });
  setReady("complete");
  registerServiceWorker();
  expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
});

test("waits for load, and logs registration failure", async () => {
  const register = mock(() => Promise.reject(new Error("nope")));
  Object.defineProperty(navigator, "serviceWorker", { value: { register }, configurable: true });
  setReady("loading");
  const err = spyOn(console, "error").mockImplementation(() => {});
  registerServiceWorker();
  expect(register).not.toHaveBeenCalled();
  window.dispatchEvent(new Event("load"));
  await Promise.resolve();
  await Promise.resolve();
  expect(register).toHaveBeenCalledTimes(1);
  expect(err).toHaveBeenCalled();
  err.mockRestore();
});
