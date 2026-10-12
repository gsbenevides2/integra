import type { StoredImage } from "@server/db/schema";
import { withSpan } from "@server/instrumentation/withSpan";

import { SpanKind, trace } from "@opentelemetry/api";

const tracer = trace.getTracer("assistant");

/** Presigned read URLs (behind the image route's redirect) expire after this long. */
export const IMAGE_URL_TTL_SECONDS = 10 * 60;
/** The browser loads images through this route, which never expires. */
export const IMAGE_ROUTE = "/api/assistant/images/";
/** Objects nothing refers to are swept once they are older than this. */
export const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;
const ROOT_PREFIX = "assistant/";
/** Uploads are downscaled in the browser; this only stops abuse. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Accepted image types and the extension their objects are stored with. */
export const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** A stored image plus the URL the browser loads it from. */
export interface ImageView extends StoredImage {
  url: string;
}

const S3_ATTRS = { "peer.service": "s3" } as const;

function prefixOf(userId: string): string {
  return `${ROOT_PREFIX}${userId}/`;
}

/**
 * The assistant's images in the private bucket (Bun's S3 client, configured by
 * the S3_* variables). Nothing is public: the browser goes through the image
 * route (owner only), which redirects to a fresh presigned URL, so a page left
 * open for hours never shows broken images; the model gets data URLs.
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
    return { ...image, url: `${IMAGE_ROUTE}${image.key.slice(ROOT_PREFIX.length)}` };
  }

  /** The key behind an image route path (what follows IMAGE_ROUTE). */
  static keyFromRoute(path: string): string {
    return `${ROOT_PREFIX}${path}`;
  }

  /** A short-lived URL the browser can read the object from directly. */
  static signedUrl(key: string): string {
    return Bun.s3.presign(key, { expiresIn: IMAGE_URL_TTL_SECONDS, method: "GET" });
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

/**
 * Deletes images no message refers to: uploads never sent, and images of a
 * turn that failed to save. Recent objects are kept, as they may be about to
 * be sent. Returns how many were deleted.
 */
export async function sweepOrphanImages(
  referenced: Set<string>,
  now = new Date(),
): Promise<number> {
  return withSpan(
    tracer,
    "assistant.image.sweep",
    { kind: SpanKind.CLIENT, attributes: S3_ATTRS },
    async (span) => {
      const orphans: string[] = [];
      let continuationToken: string | undefined;
      do {
        const page = await Bun.s3.list({ prefix: ROOT_PREFIX, continuationToken });
        for (const object of page.contents ?? []) {
          const age = now.getTime() - new Date(object.lastModified ?? now).getTime();
          if (age > ORPHAN_GRACE_MS && !referenced.has(object.key)) orphans.push(object.key);
        }
        continuationToken = page.isTruncated ? page.nextContinuationToken : undefined;
      } while (continuationToken);
      await Promise.all(orphans.map((key) => Bun.s3.delete(key)));
      span.setAttribute("assistant.image.count", orphans.length);
      return orphans.length;
    },
  );
}

export function toDataUrl(bytes: Uint8Array, mediaType: string): string {
  return `data:${mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
}
