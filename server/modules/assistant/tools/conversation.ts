import { tool } from "@openrouter/agent";
import { z } from "zod";

/**
 * Conversation control: ending the session after a goodbye, and staying silent
 * when the speech was not meant for the assistant (TV, another person, noise).
 */
export function conversationTools(onEnd: () => void, onSilence: () => void) {
  return [
    tool({
      name: "encerrar_conversa",
      description:
        "Encerra a conversa por voz quando o usuário se despede sem pedir mais nada " +
        '(ex.: "obrigado, tchau", "valeu, era só isso"). Se o pedido tiver uma ação, ' +
        "execute-a e confirme antes, na mesma resposta.",
      inputSchema: z.object({}),
      execute: async () => {
        onEnd();
        return { encerrada: true };
      },
    }),
    tool({
      name: "ficar_em_silencio",
      description:
        "Use quando a fala captada não é um pedido para a Integra: trecho de TV, vídeo, " +
        "música, outra pessoa falando ou ruído. Não escreva resposta nenhuma depois.",
      inputSchema: z.object({}),
      execute: async () => {
        onSilence();
        return { silencio: true };
      },
    }),
  ];
}
