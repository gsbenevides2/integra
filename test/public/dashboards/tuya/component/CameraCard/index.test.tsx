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

test("reveals the video once data loads and shows the online status", () => {
  const { container, getByRole, rerender } = render(
    <CameraCard name="garagem" online onOpen={() => {}} />,
  );
  const video = container.querySelector("video")!;
  expect(video.className).toContain("opacity-0");
  fireEvent(video, new Event("loadeddata"));
  expect(video.className).toContain("opacity-100");
  expect(getByRole("status").getAttribute("aria-label")).toBe("Câmera online");
  rerender(<CameraCard name="garagem" online={false} onOpen={() => {}} />);
  expect(getByRole("status").getAttribute("aria-label")).toBe("Câmera sem sinal");
});
