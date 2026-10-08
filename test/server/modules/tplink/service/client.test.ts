import { TpLinkClient } from "@server/modules/tplink/service/client";
import { aesEncrypt, randomKeyIvPart } from "@server/modules/tplink/service/protocolCrypto";

import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";

// Deterministic router: stub clock/random so the client's AES key == ours.
let keyIv = "";
let gdprReplies: string[] = [];
let gdprParmReply: () => Response;
let indexHtml = "";
let gdprStatus = 200;
let urls: { url: string; headers: Record<string, string> }[] = [];

// happy-dom's global Response hides set-cookie, so use a minimal fake response.
const fr = (text: string, status = 200, cookie?: string) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => (k === "set-cookie" ? (cookie ?? null) : null) },
    text: async () => text,
  }) as unknown as Response;

const GDPR_OK = () =>
  fr('var nn="' + "f".repeat(128) + '";\nvar ee="1";\nvar seq="100";', 200, "JSESSIONID=abc; path=/");

beforeEach(() => {
  spyOn(Date, "now").mockReturnValue(1700000000000);
  spyOn(Math, "random").mockReturnValue(0.123456789);
  keyIv = randomKeyIvPart();
  gdprReplies = [];
  gdprParmReply = GDPR_OK;
  indexHtml = '<script>var token="TOK";</script>';
  gdprStatus = 200;
  urls = [];
  spyOn(globalThis, "fetch").mockImplementation((async (input: any, init?: any) => {
    const url = String(input);
    urls.push({ url, headers: { ...(init?.headers ?? {}) } });
    if (url.endsWith("/cgi/getGDPRParm")) return gdprParmReply();
    if (url.endsWith("/cgi_gdpr?9")) {
      if (gdprStatus !== 200) return fr("boom", gdprStatus);
      return fr(aesEncrypt(gdprReplies.shift() ?? "{}", keyIv, keyIv));
    }
    return fr(indexHtml);
  }) as any);
});
afterEach(() => mock.restore());

const mk = () => new TpLinkClient({ host: "10.0.0.1", username: "user", password: "pw" });

test("login success (json), then call/wrappers, cookie and token sent", async () => {
  const c = mk();
  gdprReplies.push('{"success":true}');
  await c.login(1);
  gdprReplies.push('{"a":1}', "not json", '{"b":2}', "{}", "{}", "{}", "{}", "{}");
  expect(await c.call("go", "OID")).toEqual({ a: 1 });
  expect(await c.call("go", "OID")).toBe("not json");
  expect(await c.get("X")).toEqual({ b: 2 });
  await c.add("X");
  await c.getList("X");
  await c.getSubList("X");
  await c.set("X");
  await c.del("X");
  const last = urls.at(-1)!;
  expect(last.headers.Cookie).toBe("JSESSIONID=abc");
  expect(last.headers.TokenID).toBe("TOK");
});

test("login accepts $.ret = 0", async () => {
  gdprReplies.push("$.ret = 0;");
  await mk().login(1);
});

test("op wrapper", async () => {
  const c = mk();
  gdprReplies.push("$.ret=0");
  await c.login(1);
  gdprReplies.push("{}");
  await c.op("ACT_REBOOT");
});

test("login failure variants", async () => {
  gdprReplies.push("$.ret = 7;");
  await expect(mk().login(1)).rejects.toThrow("error code 7");
  gdprReplies.push("garbage");
  await expect(mk().login(1)).rejects.toThrow("Unrecognized login response");
  gdprReplies.push('{"success":false}');
  await expect(mk().login(1)).rejects.toThrow("Login failed:");
});

test("login: session expired and missing token", async () => {
  gdprReplies.push("$.ret = 0;");
  indexHtml = "<html>Please LOGIN</html>";
  await expect(mk().login(1)).rejects.toThrow("Session expired");
  gdprReplies.push("$.ret = 0;");
  indexHtml = "<html>nothing</html>";
  await expect(mk().login(1)).rejects.toThrow("Could not extract token");
});

test("getGDPRParm failures", async () => {
  gdprParmReply = () => fr("nope", 500);
  await expect(mk().login(1)).rejects.toThrow("getGDPRParm failed: HTTP 500");
  gdprParmReply = () => fr("var nn='x'");
  await expect(mk().login(1)).rejects.toThrow("Could not parse getGDPRParm");
});

test("http failure on gdpr is wrapped", async () => {
  gdprStatus = 500;
  await expect(mk().login(1)).rejects.toThrow("Request Error");
});

test("login retries with backoff then succeeds", async () => {
  gdprStatus = 500;
  const orig = gdprParmReply;
  let n = 0;
  gdprParmReply = () => {
    if (++n === 2) gdprStatus = 200; // first attempt fails at /cgi_gdpr, retry succeeds
    return orig();
  };
  gdprReplies.push('{"success":true}');
  await mk().login(2, 1);
});

test("call before login throws", async () => {
  await expect(mk().call("go", "X")).rejects.toThrow("Not logged in");
});
