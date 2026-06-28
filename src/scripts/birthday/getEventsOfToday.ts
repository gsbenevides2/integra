import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getInstrumentableFetchLink } from "instrumentation";
import { loginInAuthentik } from "utils/authentik/login";

export default async function getEventsOfToday(traceId: string) {
    const { access_token } = await loginInAuthentik(
        {
            client_id: "xhbRL9JJoECA9lvZV7JmmQdWQVUQ1ATY1KMX3DkR",
        },
        traceId,
    );
    const client = new Client({
        name: "Integra",
        version: "1.0.0",
    });
    const headers = new Headers();
    const url = new URL("https://birthday.local.gui.dev.br/mcp");
    headers.set("Authorization", "Bearer " + access_token);
    const transport = new StreamableHTTPClientTransport(url, {
        requestInit: {
            headers,
        },
        fetch: getInstrumentableFetchLink(traceId),
    });
    await client.connect(transport);
    const result = await client.callTool({
        name: "list-birthday-events-by-current-day",
        arguments: {},
    });

    const content = result.content as { text: string }[];
    return content.at(0)?.text ?? "";
}
