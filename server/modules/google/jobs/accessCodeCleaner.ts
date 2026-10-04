import { GmailService } from "../service/gmail";

const OWNER_EMAIL = "guilherme.benevides@econverse.com.br";

/**
 * Moves access-code emails from tech@econverse.com.br to trash.
 * Runs every hour — only processes emails received in the last hour.
 */
export async function cleanAccessCodeEmails(): Promise<void> {
  const query = `subject:"Seu código de acesso é" OR subject:"Your access code is"`;
  while (true) {
    const emails = await GmailService.search(OWNER_EMAIL, query);
    if (emails.length === 0) {
      break;
    }

    await GmailService.batchDelete(
      OWNER_EMAIL,
      emails.map((email) => email.id),
    );
    if (emails.length < 500) {
      break;
    }
  }
}
