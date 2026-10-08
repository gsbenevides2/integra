import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { afterAll } from "bun:test";

import { installDb, restoreDb } from "../../../helpers/google-db";
installDb();
import { oauthCallbackQuery } from "@server/modules/google/model";

const { googleRoutes } = await import("@server/modules/google/index");
const { GoogleAccountService } = await import("@server/modules/google/service/accounts");
afterAll(restoreDb);

const req = (path: string, method = "GET") => googleRoutes.handle(new Request(`http://localhost${path}`, { method }));
const spies: { mockRestore(): void }[] = [];
afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

describe("googleRoutes", () => {
  test("model", () => {
    expect(oauthCallbackQuery.parse({}).code).toBeUndefined();
  });
  test("oauth start redirects", async () => {
    spies.push(spyOn(GoogleAccountService, "getAuthUrl").mockReturnValue("http://g/auth"));
    const res = await req("/api/google/oauth/start");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://g/auth");
  });
  test("callback: missing code, success, error (Error and non-Error)", async () => {
    let res = await req("/api/google/oauth/callback");
    expect(res.headers.get("location")).toContain("googleAccountError=missing_code");
    const s = spyOn(GoogleAccountService, "processCode");
    spies.push(s);
    s.mockResolvedValue("a@b");
    res = await req("/api/google/oauth/callback?code=c");
    expect(res.headers.get("location")).toContain("googleAccountAdded=1");
    s.mockRejectedValue(new Error("boom"));
    res = await req("/api/google/oauth/callback?code=c");
    expect(res.headers.get("location")).toContain("googleAccountError=boom");
    s.mockRejectedValue("str");
    res = await req("/api/google/oauth/callback?code=c");
    expect(res.headers.get("location")).toContain("googleAccountError=str");
  });
  test("accounts list and delete", async () => {
    spies.push(spyOn(GoogleAccountService, "listAccounts").mockResolvedValue(["a"]));
    expect(await (await req("/api/google/accounts")).json()).toEqual({ accounts: ["a"] });
    const d = spyOn(GoogleAccountService, "deleteAccount");
    spies.push(d);
    d.mockResolvedValue(true);
    expect(await (await req("/api/google/accounts/a", "DELETE")).json()).toEqual({ ok: true });
    d.mockResolvedValue(false);
    expect((await req("/api/google/accounts/a", "DELETE")).status).toBe(404);
  });
});
