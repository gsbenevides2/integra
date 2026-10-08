import { generateMessage } from "@server/modules/authentik/service/message";

import { afterAll, describe, expect, mock, test } from "bun:test";

const discord = { ...(await import("@server/shared/discord")) };
const evolution = { ...(await import("@server/shared/evolution")) };
const sent: string[] = [];
mock.module("@server/shared/discord", () => ({
  ...discord,
  sendDiscordMessage: async (m: string) => void sent.push(`d:${m}`),
}));
mock.module("@server/shared/evolution", () => ({
  ...evolution,
  sendEvolutionMessage: async (m: string) => void sent.push(`e:${m}`),
}));
const { authentikRoutes } = await import("@server/modules/authentik/index");
afterAll(() => {
  mock.module("@server/shared/discord", () => discord);
  mock.module("@server/shared/evolution", () => evolution);
});

describe("generateMessage", () => {
  test("password stage with full payload", () => {
    const raw =
      "login_failed: {'stage': {'model_name': 'passwordstage'}, 'asn': {'network': '1.2.3.0/24', 'asn': 99, 'as_org': 'Org'}, 'oauth_userinfo': {'email': 'a@b.c', 'username': 'u', 'name': 'N'}, 'geo': {'city': 'SP', 'country': 'BR', 'lat': 1, 'long': 2}, 'http_request': {'user_agent': 'UA'}, 'x': None, 'y': True, 'z': False}";
    const m = generateMessage(raw, "e@e", "eu");
    for (const s of ["Usuário e Senha inválidos", "1.2.3.0", "a@b.c", "- 👤 Username: u", "N", "SP", "BR", "Latitude: 1 | Longitude: 2", "ASN: 99", "Org", "UA"])
      expect(m).toContain(s);
  });
  test("other login types", () => {
    expect(generateMessage("{'stage': {'model_name': 'authenticatorvalidatestage'}}", "e", "u")).toContain("TOTP");
    expect(generateMessage("{'source': 'Google x'}", "e", "u")).toContain("Google");
    expect(generateMessage("{'source': 'Discord x'}", "e", "u")).toContain("Login social com Discord");
  });
  test("fallbacks", () => {
    const m = generateMessage("{}", "ev@x", "evu");
    expect(m).toContain("Tipo de Login: Desconhecido");
    expect(m).toContain("IP: Desconhecido");
    expect(m).toContain("Email: ev@x");
    expect(m).toContain("Username: evu");
    expect(generateMessage("{'username': 'pu'}", "e", "u")).toContain("Username: pu");
  });
});

describe("route", () => {
  test("POST /api/authentik/login-failed", async () => {
    const res = await authentikRoutes.handle(
      new Request("http://localhost/api/authentik/login-failed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: "{}",
          severity: "s",
          user_email: "a",
          user_username: "b",
          event_user_email: "c",
          event_user_username: "d",
        }),
      }),
    );
    expect(await res.text()).toBe("OK");
    expect(sent.map((s) => s[0])).toEqual(["d", "e"]);
  });
});
