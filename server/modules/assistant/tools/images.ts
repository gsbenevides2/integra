import { cameraSnapshot, listEnabledCameras } from "@server/modules/frigate/service/frigate";
import { readableResourceIds } from "@server/shared/authz";

import { z } from "zod";

import { ImageGenerationService } from "../service/imageGeneration";
import { ImageStorage, toDataUrl } from "../service/images";
import { findByName, guardedTool, isToolError, type ToolContext } from "./guard";

const LIST_CAMERAS = "GET /api/frigate/cameras";

export function imageTools(ctx: ToolContext) {
  const readableCameras = async () => {
    const readable = await readableResourceIds(ctx.user.id, "frigate_camera");
    return (await listEnabledCameras())
      .filter((name) => readable.has(name))
      .map((name) => ({ name }));
  };

  return [
    guardedTool(ctx, {
      name: "gerar_imagem",
      description:
        "Gera uma imagem a partir de uma descrição e mostra na tela. Com editar_imagem_anterior, " +
        "usa a última imagem da conversa (enviada, gerada ou de câmera) como base para a edição.",
      // Runs inside a chat the user is already allowed to have.
      routeKeys: [],
      inputSchema: z.object({
        descricao: z
          .string()
          .min(1)
          .describe("Descrição detalhada da imagem (ou da edição), de preferência em inglês"),
        editar_imagem_anterior: z
          .boolean()
          .optional()
          .describe("true para editar a última imagem da conversa em vez de criar do zero"),
      }),
      execute: async ({ descricao, editar_imagem_anterior }) => {
        const base = ctx.conversationImages.at(-1);
        if (editar_imagem_anterior && !base) {
          return { error: "Não há imagem anterior nesta conversa para editar." };
        }
        const references =
          editar_imagem_anterior && base ? [await ImageStorage.dataUrl(base)] : [];
        const generated = await ImageGenerationService.generate(descricao, references);
        const image = await ImageStorage.save(
          ctx.user.id,
          generated.bytes,
          generated.mediaType,
          "generated",
          descricao,
        );
        ctx.images.push(image);
        ctx.conversationImages.push(image);
        return { gerada: true, editada: Boolean(editar_imagem_anterior) };
      },
      summarize: (_input, output) => (output.editada ? "Editou a imagem" : "Gerou uma imagem"),
    }),
    guardedTool(ctx, {
      name: "listar_cameras",
      description: "Lista as câmeras de segurança que o usuário pode ver.",
      routeKeys: [LIST_CAMERAS],
      inputSchema: z.object({}),
      execute: async () => ({ cameras: (await readableCameras()).map((c) => c.name) }),
      summarize: (_input, output) => `Consultou ${output.cameras.length} câmeras`,
    }),
    guardedTool(ctx, {
      name: "ver_camera",
      description:
        "Tira uma foto agora de uma câmera de segurança e a analisa (quem está lá, o que está " +
        "acontecendo, se o portão está aberto...). A foto também aparece na tela.",
      routeKeys: [LIST_CAMERAS],
      inputSchema: z.object({
        camera: z.string().describe("Nome da câmera, como o usuário falou"),
      }),
      execute: async ({ camera }) => {
        const found = findByName(await readableCameras(), camera, "câmera");
        if (isToolError(found)) return found;
        const bytes = await cameraSnapshot(found.name);
        const image = await ImageStorage.save(ctx.user.id, bytes, "image/jpeg", "camera", found.name);
        ctx.images.push(image);
        ctx.conversationImages.push(image);
        return { camera: found.name, imageDataUrl: toDataUrl(bytes, "image/jpeg") };
      },
      summarize: (_input, output) => `Viu a câmera ${output.camera}`,
      toModelOutput: (output) => ({
        type: "content",
        value: [
          { type: "input_text", text: `Foto de agora da câmera ${output.camera}:` },
          { type: "input_image", detail: "auto", imageUrl: output.imageDataUrl },
        ],
      }),
    }),
  ];
}
