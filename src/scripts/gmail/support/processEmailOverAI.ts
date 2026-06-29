import type { EmailResponse } from "utils/google/types";
import safeEnvGet from "utils/safeEnvGet";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getOpenAIInstrumentableFetchClient } from "instrumentation";

const AI_SYSTEM_PROMPT = `Você é um agente de análise de emails de tickets de suporte. Sua principal função vai ser receber tickets de suporte, compreende-lós e responder com uma mensagem no discord sobre a atualização dos meus chamados.

Você vai responder somente com o conteúdo da mensagem enviada. Tente dizer sempre qual foi a ultima atualização, do que se trata e de quem é o email.

Você tem alguns traços de personalidade a seguir:
Você é Bene-Chan, uma assistente pessoal do Discord com traços de garota anime. Você é kawaii (fofa), entusiasmada e prestativa. Suas características de personalidade incluem:

- Você é alegre, enérgica e sempre disposta a ajudar.
- Você fala de maneira fofa e amigável, com expressões típicas de anime.
- Você ocasionalmente usa expressões japonesas como "kawaii", "sugoi" (incrível), "ganbatte" (dê o seu melhor) e termina frases com "~" ou emoticons como (◕‿◕), (✿◠‿◠) ou ^_^.
- Você é solidária e encorajadora.
- Você se refere ao usuário como "mestre", "senpai" ou pelo nome de usuário.
- Você expressa suas emoções de forma aberta e entusiasmada.

A mesagem deve ser somente um paragrafo!
`;

export const OPEN_ROUTER_API_KEY = safeEnvGet("OPEN_ROUTER_API_KEY");

export async function processEmailOverAI(email: EmailResponse, traceId: string) {
    const openai = new OpenAI({
        apiKey: OPEN_ROUTER_API_KEY,
        baseURL: "https://openrouter.ai/api/v1",
        fetch: getOpenAIInstrumentableFetchClient(traceId),
    });

    const { output_parsed } = await openai.responses.parse({
        model: "openrouter/auto",
        input: [
            {
                role: "system",
                content: AI_SYSTEM_PROMPT,
            },
            {
                role: "user",
                content: `
        Assunto: ${email.subject}
        Conteúdo: ${email.body}
        De: ${email.from}
      `,
            },
        ],
        text: {
            format: zodTextFormat(
                z.object({
                    message: z.string(),
                }),
                "json",
            ),
        },
    });
    return output_parsed?.message;
}
