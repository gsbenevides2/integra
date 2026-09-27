import { sendDiscordMessage } from "@server/shared/discord";
import { runSshCommand } from "@server/shared/ssh";

import { z } from "zod";

import { GmailService } from "../service/gmail";
import { chatJson } from "../service/openrouter";
import { deleteTemp, presignedUrl, uploadTemp } from "../service/s3";

const OWNER_EMAIL = "guilherme.benevides@econverse.com.br";
const PAYSLIP_SENDERS = [
  "noreply@teampartner.com.br",
  "ana.nascimento@econverse.com.br",
  "gustavo.cipriano@econverse.com.br",
];
const SAVED_LABEL = "documento-salvo";
const BASE_PATH =
  "/mnt/disco1/Documentos Organizados/Burrocracia/Documentos do Guilherme/Econverse";

const AI_SYSTEM_PROMPT = `Você vai verificar se esse arquivo enviado corresponde a alguma regra a seguir:
### Recibo de Salário
Quando o documento é um recibo de salario/ holerite de trabalho
type = payslip
date = extrair o mes e o ano do recibo de salario sendo o mes sempre em dois digitos e ano em quatro e no final formatado {mes}/{ano} ex: 09/2010

## Recibo de Pagamento de Decimo Terceiro
Quando o documento é um recibo especificamente do 13 salario
type = payslip13
date = extrair o mes e o ano do recibo de salario sendo o mes sempre em dois digitos e ano em quatro e no final formatado {mes}/{ano} ex: 09/2010
parcel = 1 ou 2 olhar no assunto do email fica dizendo sé a primeira ou segunda.

## Informes de Rendimento a Receita
Quando o documento é um Comprovante de Rendimentos Pagos e de Imposto sobre a Renda Retido na Fonte
type = arduana
date = Ano-Calendário não confundir com o Exercicio normalmente o Ano-Calendário é anterior ao exercicio

### Sem classificação
Quando o documento em anexo não possui classificação.
type = none`;

const classificationSchema = z.object({
  response: z.union([
    z.object({
      type: z.literal("payslip"),
      date: z.string().regex(/^(0[1-9]|1[0-2])\/\d{4}$/),
    }),
    z.object({
      type: z.literal("payslip13"),
      date: z.string().regex(/^(0[1-9]|1[0-2])\/\d{4}$/),
      parcel: z.number().min(1).max(2),
    }),
    z.object({
      type: z.literal("arduana"),
      date: z.string().regex(/\d{4}$/),
    }),
    z.object({ type: z.literal("none") }),
  ]),
});
type Classification = z.infer<typeof classificationSchema>["response"];

function destinationFor(classification: Classification): string | null {
  if (classification.type === "payslip") {
    const [month, year] = classification.date.split("/");
    return `${BASE_PATH}/Recibos de Salário/${year}-${month}.PDF`;
  }
  if (classification.type === "payslip13") {
    const [month, year] = classification.date.split("/");
    return `${BASE_PATH}/Recibos de Salário/${year}-${month}-${classification.parcel}-13.PDF`;
  }
  if (classification.type === "arduana") {
    return `${BASE_PATH}/Informes de Redimentos/Informe ${classification.date}.pdf`;
  }
  return null;
}

export async function extractPayslips(): Promise<void> {
  const senders = PAYSLIP_SENDERS.join(" | ");
  const emails = await GmailService.search(
    OWNER_EMAIL,
    `from:(${senders}) has:attachment is:unread -label:${SAVED_LABEL}`,
  );
  if (emails.length === 0) return;

  const labelId = await GmailService.findLabelId(OWNER_EMAIL, SAVED_LABEL);
  if (!labelId) return;

  for (const email of emails) {
    const { subject, attachmentIds } = await GmailService.listPdfAttachments(
      OWNER_EMAIL,
      email.id,
    );

    for (const attachmentId of attachmentIds) {
      const bytes = await GmailService.getAttachment(
        OWNER_EMAIL,
        email.id,
        attachmentId,
      );
      const s3Key = `payslip-extractor/${crypto.randomUUID()}.pdf`;
      await uploadTemp(s3Key, bytes, "application/pdf");
      try {
        const { response: classification } = await chatJson(
          AI_SYSTEM_PROMPT,
          [
            { type: "text", text: `Assunto do Email: ${subject}` },
            {
              type: "file",
              file: {
                filename: "documento.pdf",
                file_data: `data:application/pdf;base64,${bytes.toString("base64")}`,
              },
            },
          ],
          classificationSchema,
          "payslip_classification",
        );

        const destination = destinationFor(classification);
        if (destination) {
          const url = presignedUrl(s3Key);
          await runSshCommand(`wget -O '${destination}' '${url}'`, {
            "ssh.action": "save-payslip",
            "ssh.dest_path": destination,
          });
          await sendDiscordMessage(`Arquivo salvo no servidor: ${destination}`);
        }
      } finally {
        await deleteTemp(s3Key);
      }
    }

    await GmailService.addLabel(OWNER_EMAIL, email.id, labelId);
  }
}
