import {
  MAX_UPLOAD_DIMENSION,
  prepareImage,
  UPLOAD_JPEG_QUALITY,
  uploadImage,
} from "@public/components/VoiceAssistantContext/imageUpload";

import { afterAll, afterEach, describe, expect, test } from "bun:test";

import { fail, useApi } from "../../../helpers/dash-api";

let uploadReply: unknown = { key: "assistant/u/upload/a.jpg", url: "https://signed" };
const calls = useApi({ "POST /api/assistant/uploads": () => uploadReply });

const g = globalThis as Record<string, unknown>;
const realBitmap = g.createImageBitmap;
const realCanvas = g.OffscreenCanvas;
let bitmapSize = { width: 4000, height: 2000 };
let drawn: number[] = [];
let converted: unknown[] = [];
g.createImageBitmap = async (file: Blob) => {
  if (file.type === "image/broken") throw new Error("decode");
  return { ...bitmapSize, close: () => {} };
};
g.OffscreenCanvas = class {
  constructor(
    public width: number,
    public height: number,
  ) {}
  getContext() {
    return { drawImage: (_b: unknown, _x: number, _y: number, w: number, h: number) => drawn.push(w, h) };
  }
  async convertToBlob(options: unknown) {
    converted.push(options);
    return new Blob(["jpeg"], { type: "image/jpeg" });
  }
};
afterAll(() => {
  g.createImageBitmap = realBitmap;
  g.OffscreenCanvas = realCanvas;
});
afterEach(() => {
  bitmapSize = { width: 4000, height: 2000 };
  drawn = [];
  converted = [];
  uploadReply = { key: "assistant/u/upload/a.jpg", url: "https://signed" };
});

describe("prepareImage", () => {
  test("downscales large photos to a JPEG", async () => {
    const out = await prepareImage(new Blob(["x"], { type: "image/png" }));
    expect(out.type).toBe("image/jpeg");
    expect(drawn).toEqual([MAX_UPLOAD_DIMENSION, MAX_UPLOAD_DIMENSION / 2]);
    expect(converted).toEqual([{ type: "image/jpeg", quality: UPLOAD_JPEG_QUALITY }]);
  });

  test("keeps small files, GIFs and undecodable files as they are", async () => {
    bitmapSize = { width: 800, height: 600 };
    const small = new Blob(["x"], { type: "image/png" });
    expect(await prepareImage(small)).toBe(small);
    const gif = new Blob(["x"], { type: "image/gif" });
    expect(await prepareImage(gif)).toBe(gif);
    const broken = new Blob(["x"], { type: "image/broken" });
    expect(await prepareImage(broken)).toBe(broken);
  });

  test("re-encodes small but heavy files", async () => {
    bitmapSize = { width: 800, height: 600 };
    const heavy = new Blob([new Uint8Array(2 * 1024 * 1024)], { type: "image/png" });
    expect((await prepareImage(heavy)).type).toBe("image/jpeg");
    expect(drawn).toEqual([800, 600]);
  });
});

describe("uploadImage", () => {
  test("posts the prepared image and returns the stored one", async () => {
    expect(await uploadImage(new Blob(["x"], { type: "image/png" }))).toEqual(uploadReply as never);
    expect(calls[0]?.path).toBe("/api/assistant/uploads");
  });

  test("explains unsupported types and other failures", async () => {
    uploadReply = fail(415);
    await expect(uploadImage(new Blob(["x"], { type: "image/gif" }))).rejects.toThrow(
      "Formato de imagem não suportado",
    );
    uploadReply = fail(500);
    await expect(uploadImage(new Blob(["x"], { type: "image/gif" }))).rejects.toThrow(
      "Falha ao enviar a imagem",
    );
  });
});
