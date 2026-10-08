import { openapi } from "@server/openapi";

import { expect, test } from "bun:test";
import { Elysia } from "elysia";

test("openapi plugin serves a spec with project info", async () => {
  const app = new Elysia().use(openapi).get("/x", () => "ok");
  const res = await app.handle(new Request("http://localhost/openapi/json"));
  const spec = (await res.json()) as { info: { license: { url: string } } };
  expect(spec.info.license.url).toEndWith("/blob/main/LICENSE");
});
