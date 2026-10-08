import React from "react";

// Must load first: the dashboards import this module back (cycle).
import { GlobalDrawerProvider, useGlobalDrawer } from "@public/components/GlobalDrawerContext/index";
import { cronsDashboard } from "@public/dashboards/crons";
import { tuyaDashboard } from "@public/dashboards/tuya";
import { APP_VERSION } from "@public/version";

import { openobserveRum } from "@openobserve/browser-rum";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect, spyOn, test } from "bun:test";

import { renderWithProviders } from "../../../helpers/public-render";

// Dashboards are real modules (importing them any other way hits the import cycle through
// this file), but their page content is swapped for stubs so nothing fetches.
const realTuya = tuyaDashboard.content;
const realCrons = cronsDashboard.content;
beforeAll(() => {
  tuyaDashboard.content = () => <div>tuya page</div>;
  cronsDashboard.content = () => <div>crons page</div>;
});
afterAll(() => {
  tuyaDashboard.content = realTuya;
  cronsDashboard.content = realCrons;
});
afterEach(cleanup);

test("menu lists dashboards, navigates, closes", () => {
  const ctx = spyOn(openobserveRum, "getInternalContext").mockReturnValue({ session_id: "sess-1" } as any);
  renderWithProviders(
    <GlobalDrawerProvider>
      <span>child</span>
    </GlobalDrawerProvider>,
  );
  expect(screen.getByText("child")).toBeTruthy();
  expect(screen.getByText("tuya page")).toBeTruthy();
  expect(screen.getByText(`v${APP_VERSION}`, { exact: false })).toBeTruthy();
  fireEvent.click(screen.getByText(cronsDashboard.name));
  expect(screen.getByText("crons page")).toBeTruthy();
  expect(screen.queryByText("tuya page")).toBeNull();

  // copy session id
  const writeText = spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  fireEvent.click(screen.getByText("RUM Session Id: sess-1"));
  expect(writeText).toHaveBeenCalledWith("sess-1");
  expect(screen.getByText(/Copiado para/)).toBeTruthy();
  ctx.mockRestore();
  writeText.mockRestore();
});

test("session id falls back to empty; swipe opens drawer", () => {
  const ctx = spyOn(openobserveRum, "getInternalContext").mockReturnValue(undefined as any);
  const { container } = renderWithProviders(<GlobalDrawerProvider>{null}</GlobalDrawerProvider>);
  expect(screen.getByText("RUM Session Id:", { exact: false })).toBeTruthy();
  expect(container.querySelector("[data-drawer-open]")).toBeNull();
  const list = [{ clientX: 50, clientY: 100 }];
  const s: any = new Event("touchstart");
  s.touches = list;
  const e: any = new Event("touchend");
  e.changedTouches = [{ clientX: 250, clientY: 100 }];
  const realNow = Date.now;
  Date.now = () => realNow() + 100000;
  act(() => {
    window.dispatchEvent(s);
    window.dispatchEvent(e);
  });
  Date.now = realNow;
  expect(container.querySelector("[data-drawer-open]")).not.toBeNull();
  // backdrop click closes (onClose)
  fireEvent.click(container.querySelector(".bg-black\\/50")!);
  expect(container.querySelector("[data-drawer-open]")).toBeNull();
  ctx.mockRestore();
});

test("default context value is inert outside the provider", () => {
  let value: ReturnType<typeof useGlobalDrawer>;
  function Probe() {
    value = useGlobalDrawer();
    return null;
  }
  render(<Probe />);
  value!.setIsOpen(true);
  value!.setPage("x");
  expect(value!.page).toBe("");
  expect(value!.dashboardList.length).toBe(7);
});
