import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getInstrumentableFetchClient } from "instrumentation";
import { loginInAuthentik } from "utils/authentik/login";
import safeEnvGet from "utils/safeEnvGet";

const birthdayServiceClientId = safeEnvGet("BIRTHDAY_SERVICE_CLIENT_ID");
const birthdayServiceEndpoint = safeEnvGet("BIRTHDAY_SERVICE_ENDPOINT");

export default async function getEventsOfToday(traceId: string) {
    const { access_token } = await loginInAuthentik(
        {
            client_id: birthdayServiceClientId,
        },
        traceId,
    );
    const client = new Client({
        name: "Integra",
        version: "1.0.0",
    });
    const headers = new Headers();
    const url = new URL("/mcp", birthdayServiceEndpoint);
    headers.set("Authorization", "Bearer " + access_token);
    const transport = new StreamableHTTPClientTransport(url, {
        requestInit: {
            headers,
        },
        fetch: getInstrumentableFetchClient(traceId),
    });
    await client.connect(transport);
    const result = await client.callTool({
        name: "list-birthday-events-by-current-day",
        arguments: {},
    });

    const content = result.content as { text: string }[];
    return content.at(0)?.text ?? "";
}
