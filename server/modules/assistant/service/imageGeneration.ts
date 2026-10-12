import { withSpan } from "@server/instrumentation/withSpan";
import safeEnvGet from "@server/safeEnvGet";

import { SpanKind, trace } from "@opentelemetry/api";

const tracer = trace.getTracer("assistant");

export const OPENROUTER_IMAGES_URL = "https://openrouter.ai/api/v1/images";
/** Good at Portuguese prompts and at editing a reference image. */
export const DEFAULT_IMAGE_MODEL = "google/gemini-3-pro-image";

export interface GeneratedImage {
  bytes: Uint8Array;
  mediaType: string;
}

interface ImagesResponse {
  data?: { b64_json?: string; media_type?: string }[];
}

export abstract class ImageGenerationService {
  // explicit ctor: bun cannot count an implicit one as covered
  constructor() {}

  /**
   * Generates one image from a prompt; `references` (data URLs) make it an
   * edit of earlier images. Override the model with ASSISTANT_IMAGE_MODEL.
   */
  static generate(prompt: string, references: string[] = []): Promise<GeneratedImage> {
    const model = process.env.ASSISTANT_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
    return withSpan(
      tracer,
      "assistant.image.generate",
      {
        kind: SpanKind.CLIENT,
        attributes: {
          "peer.service": "openrouter",
          "assistant.image.model": model,
          "assistant.image.references": references.length,
        },
      },
      async () => {
        const response = await fetch(OPENROUTER_IMAGES_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${safeEnvGet("OPEN_ROUTER_API_KEY")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            prompt,
            ...(references.length > 0 && {
              input_references: references.map((url) => ({
                type: "image_url",
                image_url: { url },
              })),
            }),
          }),
        });
        if (!response.ok) {
          throw new Error(
            `Image generation failed: ${response.status} ${await response.text()}`,
          );
        }
        const [image] = ((await response.json()) as ImagesResponse).data ?? [];
        if (!image?.b64_json) throw new Error("The model returned no image");
        return {
          bytes: new Uint8Array(Buffer.from(image.b64_json, "base64")),
          mediaType: image.media_type ?? "image/png",
        };
      },
    );
  }
}
