import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { google } from "googleapis";

import { installDb, restoreDb, state } from "../../../../helpers/google-db";
installDb();
const ops = state.ops;
const { GoogleAccountService } = await import("@server/modules/google/service/accounts");

const env = { ...process.env };
beforeAll(() => {
  process.env.GCP_OAUTH_CLIENT_ID = "id";
  process.env.GCP_OAUTH_CLIENT_SECRET = "secret";
});
afterAll(() => {
  process.env = env;
  restoreDb();
});
afterEach(() => {
  ops.length = 0;
  state.result = [];
});

describe("GoogleAccountService", () => {
  test("getAuthUrl uses http for localhost and https otherwise", () => {
    const a = GoogleAccountService.getAuthUrl("http://localhost:3000/x");
    expect(decodeURIComponent(a)).toContain("redirect_uri=http://localhost:3000/api/google/oauth/callback");
    expect(a).toContain("access_type=offline");
    const b = GoogleAccountService.getAuthUrl("http://example.com/x");
    expect(decodeURIComponent(b)).toContain("redirect_uri=https://example.com/api/google/oauth/callback");
  });

  test("processCode stores tokens (with and without optional fields)", async () => {
    const getToken = spyOn(google.auth.OAuth2.prototype, "getToken") as any;
    const oauth2 = spyOn(google, "oauth2") as any;
    let email: string | undefined = "me@x.com";
    oauth2.mockReturnValue({ userinfo: { get: async () => ({ data: { email } }) } });
    getToken.mockResolvedValue({
      tokens: { refresh_token: "r", access_token: "a", expiry_date: 1000, id_token: "i", token_type: "Bearer" },
    });
    expect(await GoogleAccountService.processCode("c", "http://localhost")).toBe("me@x.com");
    expect(ops.map((o) => o.op)).toEqual(["insert", "values", "onConflictDoUpdate"]);
    expect((ops[1]!.args[0] as any).expiryDate).toEqual(new Date(1000));
    expect((ops[2]!.args[0] as any).set.refreshToken).toBe("r");

    ops.length = 0;
    getToken.mockResolvedValue({ tokens: { access_token: "a" } });
    await GoogleAccountService.processCode("c", "http://localhost");
    expect((ops[1]!.args[0] as any).expiryDate).toBeNull();
    expect((ops[2]!.args[0] as any).set.refreshToken).toBeUndefined();
    expect((ops[2]!.args[0] as any).set.expiryDate).toBeNull();

    email = undefined;
    await expect(GoogleAccountService.processCode("c", "http://localhost")).rejects.toThrow("Email not found");
    getToken.mockRestore();
    oauth2.mockRestore();
  });

  test("listAccounts / deleteAccount", async () => {
    state.result = [{ email: "a" }, { email: "b" }];
    expect(await GoogleAccountService.listAccounts()).toEqual(["a", "b"]);
    state.result = [{}];
    expect(await GoogleAccountService.deleteAccount("a")).toBe(true);
    state.result = [];
    expect(await GoogleAccountService.deleteAccount("a")).toBe(false);
  });

  test("getClient / getAllClients and token persistence", async () => {
    state.result = [];
    await expect(GoogleAccountService.getClient("z")).rejects.toThrow("not found: z");

    const expiry = new Date(5000);
    const row = { email: "a@x", refreshToken: "r", accessToken: "a", expiryDate: expiry, idToken: "i", tokenType: "Bearer" };
    state.result = [row];
    const c = await GoogleAccountService.getClient("a@x");
    expect(c.email).toBe("a@x");
    expect(c.authClient.credentials.refresh_token).toBe("r");

    ops.length = 0;
    c.authClient.emit("tokens", { access_token: "n", refresh_token: "nr", expiry_date: 9000, id_token: "ni", token_type: "T" });
    let set = ops.find((o) => o.op === "set")!.args[0] as any;
    expect(set).toMatchObject({ accessToken: "n", refreshToken: "nr", idToken: "ni", tokenType: "T", expiryDate: new Date(9000) });

    ops.length = 0;
    c.authClient.emit("tokens", {});
    set = ops.find((o) => o.op === "set")!.args[0] as any;
    expect(set).toMatchObject({ accessToken: "a", expiryDate: expiry, idToken: "i", tokenType: "Bearer" });
    expect(set.refreshToken).toBeUndefined();

    state.result = [{ ...row, expiryDate: null }, row];
    const all = await GoogleAccountService.getAllClients();
    expect(all).toHaveLength(2);
    ops.length = 0;
    all[0]!.authClient.emit("tokens", {});
    expect((ops.find((o) => o.op === "set")!.args[0] as any).expiryDate).toBeNull();
  });
});
