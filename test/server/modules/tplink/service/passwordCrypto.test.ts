import { decryptRouterPassword, encryptRouterPassword } from "@server/modules/tplink/service/passwordCrypto";

import { beforeAll, expect, test } from "bun:test";

beforeAll(() => {
  process.env.ROUTER_PASSWORD_SECRET = "test-secret";
});

test("encrypt/decrypt round-trips with random IV", async () => {
  const a = await encryptRouterPassword("s3nha!");
  const b = await encryptRouterPassword("s3nha!");
  expect(a).not.toBe(b);
  expect(await decryptRouterPassword(a)).toBe("s3nha!");
});
