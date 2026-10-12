import type { StoredImage } from "@server/db/schema";
import { withSpan } from "@server/instrumentation/withSpan";

import { SpanKind, trace } from "@opentelemetry/api";

const tracer = trace.getTracer("assistant");

/** Presigned read URLs handed to the browser expire after this long. */
export const IMAGE_URL_TTL_SECONDS = 60 * 60;
/** Uploads are downscaled in the browser; this only stops abuse. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Accepted image types and the extension their objects are stored with. */
export const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** A stored image plus a short-lived presigned URL the browser can load. */
export interface ImageView extends StoredImage {
  url: string;
}

const S3_ATTRS = { "peer.service": "s3" } as const;

function prefixOf(userId: string): string {
  return `assistant/${userId}/`;
}

/**
 * The assistant's images in the private bucket (Bun's S3 client, configured by
 * the S3_* variables). Nothing is public: the browser gets presigned URLs and
 * the model gets the bytes inlined as data URLs.
 */
export abstract class ImageStorage {
  // explicit ctor: bun cannot count an implicit one as covered
  constructor() {}

  static async save(
    userId: string,
    bytes: Uint8Array,
    mediaType: string,
    source: StoredImage["source"],
    label?: string,
  ): Promise<StoredImage> {
    const extension = IMAGE_EXTENSIONS[mediaType] ?? "bin";
    const key = `${prefixOf(userId)}${source}/${crypto.randomUUID()}.${extension}`;
    await withSpan(
      tracer,
      "assistant.image.save",
      { kind: SpanKind.CLIENT, attributes: { ...S3_ATTRS, "assistant.image.bytes": bytes.byteLength } },
      () => Bun.s3.write(key, bytes, { type: mediaType }),
    );
    return label ? { key, mediaType, source, label } : { key, mediaType, source };
  }

  /** True when `key` is one of this user's images (as given by a client). */
  static owns(userId: string, key: string): boolean {
    return key.startsWith(prefixOf(userId)) && !key.includes("..");
  }

  /** Rebuilds the stored image for an uploaded key the client sends back. */
  static fromUploadKey(key: string): StoredImage {
    const extension = key.split(".").pop();
    const mediaType =
      Object.entries(IMAGE_EXTENSIONS).find(([, ext]) => ext === extension)?.[0] ??
      "application/octet-stream";
    return { key, mediaType, source: "upload" };
  }

  static view(image: StoredImage): ImageView {
    return {
      ...image,
      url: Bun.s3.presign(image.key, { expiresIn: IMAGE_URL_TTL_SECONDS, method: "GET" }),
    };
  }

  /** The image inlined as a data URL, for the model. */
  static async dataUrl(image: StoredImage): Promise<string> {
    const bytes = await withSpan(
      tracer,
      "assistant.image.read",
      { kind: SpanKind.CLIENT, attributes: S3_ATTRS },
      () => Bun.s3.file(image.key).bytes(),
    );
    return toDataUrl(bytes, image.mediaType);
  }

  static async remove(images: StoredImage[]): Promise<void> {
    await withSpan(
      tracer,
      "assistant.image.delete",
      { kind: SpanKind.CLIENT, attributes: { ...S3_ATTRS, "assistant.image.count": images.length } },
      () => Promise.all(images.map((image) => Bun.s3.delete(image.key))),
    );
  }
}

export function toDataUrl(bytes: Uint8Array, mediaType: string): string {
  return `data:${mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
}
