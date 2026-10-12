import {
  IMAGE_URL_TTL_SECONDS,
  ImageStorage,
  toDataUrl,
} from "@server/modules/assistant/service/images";

import { afterEach, describe, expect, spyOn, test } from "bun:test";

const spies: { mockRestore: () => void }[] = [];
afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));
 
const spy = (key: string): any => {
  const s = spyOn(Bun.s3 as never, key as never);
  spies.push(s);
  return s;
};

describe("ImageStorage", () => {
  test("save writes under the user's prefix, by source", async () => {
    new (ImageStorage as unknown as new () => object)();
    const write = spy("write").mockResolvedValue(3);
    const image = await ImageStorage.save("u1", new Uint8Array([1, 2, 3]), "image/png", "generated", "robô");
    expect(image).toMatchObject({ mediaType: "image/png", source: "generated", label: "robô" });
    expect(image.key).toMatch(/^assistant\/u1\/generated\/[\w-]+\.png$/);
    expect(write).toHaveBeenCalledWith(image.key, new Uint8Array([1, 2, 3]), { type: "image/png" });

    const unlabeled = await ImageStorage.save("u1", new Uint8Array([1]), "image/x-odd", "upload");
    expect(unlabeled.key).toEndWith(".bin");
    expect(unlabeled).not.toHaveProperty("label");
  });

  test("owns only accepts the user's own keys", () => {
    expect(ImageStorage.owns("u1", "assistant/u1/upload/a.jpg")).toBe(true);
    expect(ImageStorage.owns("u1", "assistant/u2/upload/a.jpg")).toBe(false);
    expect(ImageStorage.owns("u1", "assistant/u1/../u2/a.jpg")).toBe(false);
    expect(ImageStorage.owns("u1", "assistant/u10/a.jpg")).toBe(false);
  });

  test("fromUploadKey infers the media type from the extension", () => {
    expect(ImageStorage.fromUploadKey("assistant/u1/upload/a.webp")).toEqual({
      key: "assistant/u1/upload/a.webp",
      mediaType: "image/webp",
      source: "upload",
    });
    expect(ImageStorage.fromUploadKey("assistant/u1/upload/a").mediaType).toBe(
      "application/octet-stream",
    );
  });

  test("view adds a presigned GET URL", () => {
    const presign = spy("presign").mockReturnValue("https://s3/signed");
    const image = { key: "k", mediaType: "image/png", source: "upload" as const };
    expect(ImageStorage.view(image)).toEqual({ ...image, url: "https://s3/signed" });
    expect(presign).toHaveBeenCalledWith("k", { expiresIn: IMAGE_URL_TTL_SECONDS, method: "GET" });
  });

  test("dataUrl inlines the object, and remove deletes every key", async () => {
    spy("file").mockReturnValue({ bytes: async () => new Uint8Array([104, 105]) });
    expect(await ImageStorage.dataUrl({ key: "k", mediaType: "image/png", source: "camera" })).toBe(
      "data:image/png;base64,aGk=",
    );
    const remove = spy("delete").mockResolvedValue(undefined);
    await ImageStorage.remove([
      { key: "a", mediaType: "image/png", source: "upload" },
      { key: "b", mediaType: "image/png", source: "upload" },
    ]);
    expect(remove.mock.calls).toEqual([["a"], ["b"]]);
  });

  test("toDataUrl", () => {
    expect(toDataUrl(new Uint8Array([104, 105]), "image/jpeg")).toBe("data:image/jpeg;base64,aGk=");
  });
});
