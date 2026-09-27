import { redisGet, redisSet } from "@server/shared/cache";
import { sendDiscordMessage } from "@server/shared/discord";

import { z } from "zod";

import { GmailService } from "../service/gmail";
import { chatJson } from "../service/openrouter";

const OWNER_EMAIL = "guilherme.benevides@econverse.com.br";
const SUPPORT_SENDERS = [
  "support@vtexhelp.zendesk.com",
  "support@wakecommerce.zendesk.com",
];
const AFTER_KEY = "google:gmail:support:after";

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

const summarySchema = z.object({ message: z.string() });

export async function watchSupportTickets(): Promise<void> {
  const after = await redisGet(AFTER_KEY);
  const afterUnix = after ? Number(after) : Math.floor(Date.now() / 1000);
  const senders = SUPPORT_SENDERS.map((sender) => `from:${sender}`).join(" ");
  const query = `is:unread -in:scheduled -from:me AND ({${senders}}) AND after:${afterUnix}`;

  const emails = await GmailService.search(OWNER_EMAIL, query);
  await redisSet(AFTER_KEY, String(Math.floor(Date.now() / 1000)));
  if (emails.length === 0) return;

  const contents = await Promise.all(
    emails.map((email) => GmailService.getFull(OWNER_EMAIL, email.id)),
  );
  const summaries = await Promise.all(
    contents.map((content) =>
      chatJson(
        AI_SYSTEM_PROMPT,
        `Assunto: ${content.subject}\nConteúdo: ${content.body}\nDe: ${content.from}`,
        summarySchema,
        "support_summary",
      ),
    ),
  );
  await Promise.all(
    summaries.map((summary) => sendDiscordMessage(summary.message)),
  );
}
