import React from "react";

import { CameraCard } from "@public/dashboards/tuya/component/CameraCard/index";

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, mock, test } from "bun:test";

afterEach(cleanup);

test("streams the camera and opens its page on click", () => {
  const onOpen = mock(() => {});
  const { container } = render(<CameraCard name="garagem" onOpen={onOpen} />);
  expect(container.querySelector("video")!.getAttribute("src")).toBe(
    "/api/frigate/cameras/garagem/stream",
  );
  fireEvent.click(container.querySelector("button")!);
  expect(onOpen).toHaveBeenCalledTimes(1);
});
