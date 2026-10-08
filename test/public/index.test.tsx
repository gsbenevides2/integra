// Must load first: the dashboards import this module back (cycle).
import "@public/components/GlobalDrawerContext";

import * as ReactDom from "react-dom/client";

import { tuyaDashboard } from "@public/dashboards/tuya";

import { openobserveLogs } from "@openobserve/browser-logs";
import { openobserveRum } from "@openobserve/browser-rum";
import { act } from "@testing-library/react";
import { expect, spyOn, test } from "bun:test";

// The OTLP span exporter would otherwise flush over the (absent) network.
spyOn(XMLHttpRequest.prototype, "send").mockImplementation(() => {});
spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));

test("entry point mounts the app and boots instrumentation + service worker", async () => {
  const spies = [
    spyOn(openobserveRum, "init").mockImplementation(() => {}),
    spyOn(openobserveLogs, "init").mockImplementation(() => {}),
    spyOn(openobserveRum, "startSessionReplayRecording").mockImplementation(() => {}),
    spyOn(openobserveRum, "getInternalContext").mockReturnValue(undefined as any),
  ];
  const realContent = tuyaDashboard.content;
  tuyaDashboard.content = () => <div>tuya page</div>;
  const root = document.createElement("div");
  root.id = "root";
  document.body.appendChild(root);

  const create = spyOn(ReactDom, "createRoot");
  await act(async () => {
    await import("@public/index");
  });

  expect(spies[0]!).toHaveBeenCalled();
  expect(root.textContent).toContain("tuya page");
  expect(root.textContent).toContain("Menu");

  act(() => create.mock.results[0]!.value.unmount());
  create.mockRestore();
  tuyaDashboard.content = realContent;
  spies.forEach((s) => s.mockRestore());
  root.remove();
});
