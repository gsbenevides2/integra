import React from "react";

import { LiveVideo } from "@public/dashboards/tuya/component/CameraPage/LiveVideo";

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";

class FakeBuffer {
  updating = false;
  buffered = { length: 1, start: () => 0, end: () => 30 };
  appended: Uint8Array[] = [];
  removed: number[][] = [];
  failAppend = false;
  handlers: Record<string, () => void> = {};
  addEventListener(type: string, fn: () => void) {
    this.handlers[type] = fn;
  }
  appendBuffer(chunk: Uint8Array) {
    if (this.failAppend) throw new Error("quota");
    this.appended.push(chunk);
  }
  remove(from: number, to: number) {
    this.removed.push([from, to]);
  }
}

const sources: FakeSource[] = [];
class FakeSource {
  buffer = new FakeBuffer();
  mimes: string[] = [];
  handlers: Record<string, () => Promise<void>> = {};
  constructor() {
    sources.push(this);
  }
  addEventListener(type: string, fn: () => Promise<void>) {
    this.handlers[type] = fn;
  }
  addSourceBuffer(mime: string) {
    this.mimes.push(mime);
    return this.buffer;
  }
}

const realMediaSource = globalThis.MediaSource;
const realFetch = globalThis.fetch;
const realCreate = URL.createObjectURL;
const realRevoke = URL.revokeObjectURL;
let revoked: string[];

const streamOf = (...chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks)
        controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });

const respond = (response: Response) => {
  globalThis.fetch = (async () => response) as unknown as typeof fetch;
};

beforeEach(() => {
  sources.length = 0;
  revoked = [];
  globalThis.MediaSource = FakeSource as unknown as typeof MediaSource;
  URL.createObjectURL = () => "blob:live";
  URL.revokeObjectURL = (url) => void revoked.push(url);
});
afterEach(() => {
  cleanup();
  globalThis.MediaSource = realMediaSource;
  globalThis.fetch = realFetch;
  URL.createObjectURL = realCreate;
  URL.revokeObjectURL = realRevoke;
});

const mount = () => {
  const ref = React.createRef<HTMLVideoElement>();
  const view = render(
    <LiveVideo src="/live" videoRef={ref} aria-label="cam" />,
  );
  return { ref, ...view, source: sources[0]! };
};

test("falls back to a plain src without MediaSource", () => {
  (globalThis as { MediaSource?: unknown }).MediaSource = undefined;
  const { ref } = mount();
  expect(ref.current!.getAttribute("src")).toBe("/live");
});

test("appends the stream into the source buffer and trims old media", async () => {
  respond(
    new Response(streamOf("a", "b"), {
      headers: { "content-type": "video/mp4; codecs=x" },
    }),
  );
  const { ref, source } = mount();
  expect(ref.current!.getAttribute("src")).toBe("blob:live");
  await source.handlers.sourceopen!();
  expect(source.mimes).toEqual(["video/mp4; codecs=x"]);
  expect(source.buffer.appended.length).toBe(2);

  ref.current!.currentTime = 20; // 20 - 15 = 5s of old media past start
  source.buffer.handlers.updateend!();
  expect(source.buffer.removed).toEqual([[0, 5]]);

  ref.current!.currentTime = 0; // nothing to trim: just keeps pumping
  source.buffer.handlers.updateend!();
  expect(source.buffer.removed.length).toBe(1);
});

test("ignores a failed response and a fetch error", async () => {
  respond(new Response("nope", { status: 502 }));
  let { source } = mount();
  await source.handlers.sourceopen!();
  expect(source.mimes).toEqual([]);
  cleanup();

  globalThis.fetch = (async () => {
    throw new Error("down");
  }) as unknown as typeof fetch;
  ({ source } = mount());
  await source.handlers.sourceopen!();
  expect(source.mimes).toEqual([]);
});

test("stops when appending fails", async () => {
  respond(
    new Response(streamOf("a"), { headers: { "content-type": "video/mp4" } }),
  );
  const { source } = mount();
  source.buffer.failAppend = true;
  await source.handlers.sourceopen!();
  expect(source.buffer.appended).toEqual([]);
});

test("chases the live edge and cleans up on unmount", () => {
  let tick!: () => void;
  const interval = spyOn(globalThis, "setInterval").mockImplementation(((
    fn: () => void,
  ) => {
    tick = fn;
    return 1;
  }) as unknown as typeof setInterval);
  const { ref, unmount } = mount();
  interval.mockRestore();
  const video = ref.current!;
  let end = 0;
  let length = 0;
  Object.defineProperty(video, "buffered", {
    get: () => ({ length, end: () => end }),
  });
  const lag = (seconds: number) => {
    length = 1;
    end = seconds;
    video.currentTime = 0;
    tick();
  };

  tick(); // nothing buffered yet
  expect(video.playbackRate).toBe(1);
  lag(0.5);
  expect(video.playbackRate).toBe(1);
  lag(2);
  expect(video.playbackRate).toBe(1.25);
  lag(10); // too far behind: jump to end - 0.75 and cap the speed at 2x
  expect(video.currentTime).toBe(9.25);
  expect(video.playbackRate).toBe(2);

  unmount();
  expect(revoked).toEqual(["blob:live"]);
});
