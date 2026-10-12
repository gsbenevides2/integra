import { ImageGenerationService } from "@server/modules/assistant/service/imageGeneration";
import { ImageStorage } from "@server/modules/assistant/service/images";
import { NO_PERMISSION } from "@server/modules/assistant/tools/guard";
import { imageTools } from "@server/modules/assistant/tools/images";
import * as frigate from "@server/modules/frigate/service/frigate";
import * as authz from "@server/shared/authz";

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import { makeContext, runTool } from "./helpers";

interface ModelTool {
  function: {
    name: string;
    toModelOutput?: (p: { output: unknown; input: unknown }) => unknown;
  };
}

const spies: { mockRestore: () => void }[] = [];
 
const spy = (obj: object, key: string): any => {
  const s = spyOn(obj as never, key as never);
  spies.push(s);
  return s;
};
let saved: { key: string; mediaType: string; source: string; label?: string }[];

beforeEach(() => {
  saved = [];
  spy(authz, "hasRouteGrant").mockResolvedValue(true);
  spy(authz, "readableResourceIds").mockResolvedValue(new Set(["frente"]));
  spy(frigate, "listEnabledCameras").mockResolvedValue(["frente", "fundos"]);
  spy(ImageStorage, "save").mockImplementation(
    async (_u: string, _b: Uint8Array, mediaType: string, source: string, label?: string) => {
      const image = { key: `assistant/test-user-id/${source}/${saved.length}`, mediaType, source, label };
      saved.push(image);
      return image;
    },
  );
});
afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

describe("camera tools", () => {
  test("listar_cameras lists only readable cameras", async () => {
    const ctx = makeContext();
    expect(await runTool(imageTools(ctx), "listar_cameras")).toEqual({ cameras: ["frente"] });
    expect(ctx.actions[0]?.summary).toBe("Consultou 1 câmeras");
  });

  test("ver_camera snapshots, stores and shows the image to the model", async () => {
    spy(frigate, "cameraSnapshot").mockResolvedValue(new Uint8Array([104, 105]));
    const ctx = makeContext();
    const tools = imageTools(ctx);
    const output = await runTool(tools, "ver_camera", { camera: "Frente" });
    expect(output).toEqual({ camera: "frente", imageDataUrl: "data:image/jpeg;base64,aGk=" });
    expect(ctx.images).toEqual([saved[0]] as never);
    expect(ctx.conversationImages).toEqual([saved[0]] as never);
    expect(saved[0]).toMatchObject({ source: "camera", label: "frente", mediaType: "image/jpeg" });
    expect(ctx.actions[0]?.summary).toBe("Viu a câmera frente");

    const modelOutput = (tools as unknown as ModelTool[])
      .find((t) => t.function.name === "ver_camera")!
      .function.toModelOutput!({ output, input: {} });
    expect(modelOutput).toEqual({
      type: "content",
      value: [
        { type: "input_text", text: "Foto de agora da câmera frente:" },
        { type: "input_image", detail: "auto", imageUrl: "data:image/jpeg;base64,aGk=" },
      ],
    });
    // Errors reach the model as plain text.
    expect(
      (tools as unknown as ModelTool[])
        .find((t) => t.function.name === "ver_camera")!
        .function.toModelOutput!({ output: NO_PERMISSION, input: {} }),
    ).toEqual({ type: "content", value: [{ type: "input_text", text: NO_PERMISSION.error }] });
  });

  test("ver_camera refuses cameras the user cannot read", async () => {
    const result = await runTool(imageTools(makeContext()), "ver_camera", { camera: "fundos" });
    expect(result).toHaveProperty("error");
    expect(saved).toEqual([]);
  });
});

describe("gerar_imagem", () => {
  test("generates, stores and attaches a new image", async () => {
    const generate = spy(ImageGenerationService, "generate").mockResolvedValue({
      bytes: new Uint8Array([1]),
      mediaType: "image/png",
    });
    const ctx = makeContext();
    expect(await runTool(imageTools(ctx), "gerar_imagem", { descricao: "um robô" })).toEqual({
      gerada: true,
      editada: false,
    });
    expect(generate).toHaveBeenCalledWith("um robô", []);
    expect(saved[0]).toMatchObject({ source: "generated", label: "um robô" });
    expect(ctx.images).toHaveLength(1);
    expect(ctx.actions[0]?.summary).toBe("Gerou uma imagem");
  });

  test("edits the latest image of the conversation", async () => {
    const generate = spy(ImageGenerationService, "generate").mockResolvedValue({
      bytes: new Uint8Array([1]),
      mediaType: "image/png",
    });
    spy(ImageStorage, "dataUrl").mockResolvedValue("data:image/png;base64,AA==");
    const ctx = makeContext();
    ctx.conversationImages.push({ key: "assistant/test-user-id/upload/a.png", mediaType: "image/png", source: "upload" });
    const result = await runTool(imageTools(ctx), "gerar_imagem", {
      descricao: "deixa azul",
      editar_imagem_anterior: true,
    });
    expect(result).toEqual({ gerada: true, editada: true });
    expect(generate).toHaveBeenCalledWith("deixa azul", ["data:image/png;base64,AA=="]);
    expect(ctx.actions[0]?.summary).toBe("Editou a imagem");
  });

  test("cannot edit when there is no earlier image", async () => {
    const ctx = makeContext();
    expect(
      await runTool(imageTools(ctx), "gerar_imagem", { descricao: "x", editar_imagem_anterior: true }),
    ).toEqual({ error: "Não há imagem anterior nesta conversa para editar." });
  });
});
