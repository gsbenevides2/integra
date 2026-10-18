import React from "react";

import { SpeedVideo } from "@public/dashboards/tuya/component/CameraPage/SpeedVideo";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, mock, test } from "bun:test";

afterEach(cleanup);

test("reapplies the chosen rate on loadedmetadata and forwards the handler", () => {
  const onLoadedMetadata = mock(() => {});
  const { container } = render(<SpeedVideo onLoadedMetadata={onLoadedMetadata} />);
  const video = container.querySelector("video")!;
  fireEvent.click(screen.getByLabelText("Aumentar velocidade"));
  fireEvent.click(screen.getByLabelText("Aumentar velocidade"));
  fireEvent.click(screen.getByLabelText("Reduzir velocidade"));
  video.playbackRate = 1;
  fireEvent.loadedMetadata(video);
  expect(video.playbackRate).toBe(1.5);
  expect(onLoadedMetadata).toHaveBeenCalled();
});
