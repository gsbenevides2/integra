import { normalizeMac } from "@server/modules/tplink/service/normalizeMac";

import { expect, test } from "bun:test";

test("normalizeMac strips separators and uppercases", () => {
  expect(normalizeMac("aa:bb:cc:01:02:03")).toBe("AABBCC010203");
  expect(normalizeMac("aa-bb-cc-01-02-03")).toBe("AABBCC010203");
  expect(normalizeMac("AABBCC010203")).toBe("AABBCC010203");
});
