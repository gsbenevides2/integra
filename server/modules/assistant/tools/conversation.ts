import { tool } from "@openrouter/agent";
import { z } from "zod";

/** Lets the model end the voice session when the user says goodbye. */
export function conversationTools(onEnd: () => void) {
  return [
    tool({
      name: "encerrar_conversa",
      description:
        "Encerra a conversa por voz quando o usuário se despede ou indica que terminou " +
        '(ex.: "obrigado, tchau", "valeu", "era só isso", "pode parar"). ' +
        "Depois de chamar, responda só com uma despedida curta.",
      inputSchema: z.object({}),
      execute: async () => {
        onEnd();
        return { encerrada: true };
      },
    }),
  ];
}
