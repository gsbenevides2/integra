import {
  DEFAULT_IMAGE_MODEL,
  ImageGenerationService,
  OPENROUTER_IMAGES_URL,
} from "@server/modules/assistant/service/imageGeneration";

import { afterAll, afterEach, describe, expect, test } from "bun:test";

import { provideEnv } from "./helpers";

afterAll(provideEnv(["OPEN_ROUTER_API_KEY"]));

const realFetch = globalThis.fetch;
const bodies: Record<string, unknown>[] = [];
function respond(response: Response) {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    expect(url).toBe(OPENROUTER_IMAGES_URL);
    bodies.push(JSON.parse(init.body as string));
    return response;
  }) as typeof fetch;
}
afterEach(() => {
  globalThis.fetch = realFetch;
  bodies.length = 0;
  delete process.env.ASSISTANT_IMAGE_MODEL;
});

describe("ImageGenerationService", () => {
  test("generates from a prompt and decodes the image", async () => {
    new (ImageGenerationService as unknown as new () => object)();
    respond(Response.json({ data: [{ b64_json: "aGk=", media_type: "image/webp" }] }));
    const image = await ImageGenerationService.generate("um robô");
    expect([...image.bytes]).toEqual([104, 105]);
    expect(image.mediaType).toBe("image/webp");
    expect(bodies[0]).toEqual({ model: DEFAULT_IMAGE_MODEL, prompt: "um robô" });
  });

  test("passes reference images for edits, and honours the model override", async () => {
    process.env.ASSISTANT_IMAGE_MODEL = "openai/gpt-image-2";
    respond(Response.json({ data: [{ b64_json: "aGk=" }] }));
    const image = await ImageGenerationService.generate("azul", ["data:image/png;base64,AA=="]);
    expect(image.mediaType).toBe("image/png");
    expect(bodies[0]).toEqual({
      model: "openai/gpt-image-2",
      prompt: "azul",
      input_references: [{ type: "image_url", image_url: { url: "data:image/png;base64,AA==" } }],
    });
  });

  test("fails on upstream errors and empty results", async () => {
    respond(new Response("no credits", { status: 402 }));
    await expect(ImageGenerationService.generate("x")).rejects.toThrow("Image generation failed: 402 no credits");
    respond(Response.json({ data: [] }));
    await expect(ImageGenerationService.generate("x")).rejects.toThrow("The model returned no image");
    respond(Response.json({}));
    await expect(ImageGenerationService.generate("x")).rejects.toThrow("The model returned no image");
  });
});
