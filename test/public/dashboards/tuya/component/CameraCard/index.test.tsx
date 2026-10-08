import React from "react";

import { CameraCard } from "@public/dashboards/tuya/component/CameraCard/index";

import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "bun:test";

afterEach(cleanup);

test("links to frigate and streams the camera", () => {
  const { container } = render(<CameraCard name="garagem" />);
  expect(container.querySelector("a")!.getAttribute("href")).toBe(
    "/api/frigate/cameras/garagem/goToFrigate",
  );
  expect(container.querySelector("video")!.getAttribute("src")).toBe(
    "/api/frigate/cameras/garagem/stream",
  );
});
