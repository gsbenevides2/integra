import { getUnixTime } from "date-fns";
import { CacheClient } from "utils/cacheClient";
import { getEmails } from "utils/google/getEmails";
import type { EmailListResponse } from "utils/google/types";

const cacheKey = "gmail:support:after";

export async function getUnreadEmails(traceId: string): Promise<EmailListResponse[]> {
    const variable = await CacheClient.get(cacheKey);
    const after = variable ? Number(variable) : getUnixTime(new Date());
    const suportEmails = ["support@vtexhelp.zendesk.com", "support@wakecommerce.zendesk.com"];
    const q = `is:unread -in:scheduled -from:me AND ({${suportEmails.map((email) => `from:${email}`).join(" ")}}) AND after:${after}`;
    const emails = await getEmails(
        {
            email: "guilherme.benevides@econverse.com.br",
            maxResults: 500,
            includeSpamTrash: true,
            q,
        },
        traceId,
    );
    await CacheClient.set(cacheKey, String(getUnixTime(new Date())));
    return emails;
}
