import { aesDecrypt, aesEncrypt, md5Hex, randomKeyIvPart, rsaEncryptNoPadding } from "@server/modules/tplink/service/protocolCrypto";

import { expect, test } from "bun:test";

test("md5Hex known vector", () => {
  expect(md5Hex("")).toBe("d41d8cd98f00b204e9800998ecf8427e");
  expect(md5Hex("abc")).toBe("900150983cd24fb0d6963f7d28e17f72");
});

test("aes encrypt/decrypt round-trips", () => {
  const key = "1234567890abcdef";
  const iv = "fedcba0987654321";
  const enc = aesEncrypt("olá, roteador", key, iv);
  expect(enc).not.toContain("olá");
  expect(aesDecrypt(enc, key, iv)).toBe("olá, roteador");
});

test("rsaEncryptNoPadding: textbook RSA, 128 hex chars per 64-byte block", () => {
  // n = 2^512 + 1 would not be prime, but modpow math is what we check: e=1 returns the padded message.
  const n = "f".repeat(128);
  expect(rsaEncryptNoPadding("A", n, "1")).toBe("41" + "0".repeat(126));
  expect(rsaEncryptNoPadding("A".repeat(65), n, "1")).toHaveLength(256);
});

test("randomKeyIvPart is 16 chars", () => {
  expect(randomKeyIvPart()).toHaveLength(16);
});
