import crypto from "node:crypto";

import { getTuyaEnvConfig, TUYA_PASULAR_ENV } from "@server/modules/tuya/service/pulsar/config";
import {
  buildPassword,
  buildQuery,
  decrypt,
  decryptByECB,
  decryptByGCM,
  encrypt,
  getTopicUrl,
} from "@server/modules/tuya/service/pulsar/utils";

import { expect, test } from "bun:test";

const key = "0123456789abcdef0123456789abcdef";

test("config env lookup", () => {
  expect(getTuyaEnvConfig(TUYA_PASULAR_ENV.PROD).value).toBe("event");
  expect(getTuyaEnvConfig(TUYA_PASULAR_ENV.TEST).value).toBe("event-test");
});

test("url, query and password builders", () => {
  expect(getTopicUrl("wss://h/", "id", "event", "?q")).toBe(
    "wss://h/ws/v2/consumer/persistent/id/out/event/id-sub?q",
  );
  expect(buildQuery({ a: "x y", b: 2 })).toBe("a=x%20y&b=2");
  expect(buildPassword("id", key)).toHaveLength(16);
});

test("ECB encrypt/decrypt round trip, and bad input yields empty string", () => {
  const cipher = encrypt({ a: 1 }, key);
  expect(decryptByECB(cipher, key)).toEqual({ a: 1 });
  expect(decrypt(cipher, key, "aes_ecb")).toEqual({ a: 1 });
  expect(decryptByECB("garbage", key)).toBe("");
  expect(encrypt({}, undefined as never)).toBe("");
});

test("GCM decrypt via decrypt()", () => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-128-gcm", key.substring(8, 24), iv);
  const body = Buffer.concat([c.update(JSON.stringify({ ok: true }), "utf8"), c.final()]);
  const data = Buffer.concat([iv, body, c.getAuthTag()]).toString("base64");
  expect(decryptByGCM(data, key)).toEqual({ ok: true });
  expect(decrypt(data, key, "aes_gcm")).toEqual({ ok: true });
  expect(decryptByGCM("AAAA", key)).toBe("");
});
