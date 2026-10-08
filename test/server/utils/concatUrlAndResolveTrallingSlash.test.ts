import { concatUrlAndResolveTrallingSlash as join } from "@server/utils/concatUrlAndResolveTrallingSlash";

import { expect, test } from "bun:test";

test("joins and drops trailing slash", () => {
  expect(join("http://host:8080", "/api/x")).toBe("http://host:8080/api/x");
  expect(join("http://host:8080", "/")).toBe("http://host:8080");
});
