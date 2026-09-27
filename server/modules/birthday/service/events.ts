import safeEnvGet from "@server/safeEnvGet";
import { loginInAuthentik } from "@server/shared/authentik";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export async function getEventsOfToday(): Promise<string> {
  const { access_token } = await loginInAuthentik(
    safeEnvGet("BIRTHDAY_SERVICE_CLIENT_ID"),
  );
  const client = new Client({ name: "Integra", version: "1.0.0" });
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${access_token}`);
  const url = new URL("/mcp", safeEnvGet("BIRTHDAY_SERVICE_ENDPOINT"));
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers },
  });
  await client.connect(transport);
  const result = await client.callTool({
    name: "list-birthday-events-by-current-day",
    arguments: {},
  });
  const content = result.content as { text: string }[];
  return content.at(0)?.text ?? "";
}
