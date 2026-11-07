import { daysInMonth, eventBody } from "@server/modules/birthday/model";
import { buildBirthdayMessage } from "@server/modules/birthday/service/message";

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

import { installTestAuthz } from "../../../helpers/auth";
import { makeFakeDb } from "../../../helpers/modules-db";

const gotify = { ...(await import("@server/shared/gotify")) };
const sent: string[] = [];
mock.module("@server/shared/gotify", () => ({ ...gotify, sendGotifyMessage: async (m: string) => void sent.push(m) }));

let fake = makeFakeDb();
mock.module("@server/db", () => ({ db: new Proxy({}, { get: (_t, p) => (fake.db as never)[p] }) }));

const { BirthdayService } = await import("@server/modules/birthday/service/events");
const { sendBirthdayMessage } = await import("@server/modules/birthday/jobs/sendMessage");
const restoreAuthz = await installTestAuthz();
const { birthdayRoutes } = await import("@server/modules/birthday/index");

afterAll(() => {
  restoreAuthz();
  mock.module("@server/shared/gotify", () => gotify);
});
beforeEach(() => {
  fake = makeFakeDb();
  sent.length = 0;
});

describe("model", () => {
  test("daysInMonth allows 29/02", () => {
    expect(daysInMonth(2)).toBe(29);
    expect(daysInMonth(4)).toBe(30);
  });
  test("eventBody validates the day against the month", () => {
    expect(eventBody.safeParse({ title: " Ana ", month: 2, day: 29 }).data?.title).toBe("Ana");
    expect(eventBody.safeParse({ title: "x", month: 4, day: 31 }).success).toBe(false);
    expect(eventBody.safeParse({ title: " ", month: 4, day: 1 }).success).toBe(false);
  });
});

describe("buildBirthdayMessage", () => {
  test("none", () => {
    expect(buildBirthdayMessage([])).toContain("não temos aniversariantes");
  });
  test("names", () => {
    expect(buildBirthdayMessage(["Maria", "Joao"])).toContain("Maria\n🎈 Joao");
  });
});

describe("service", () => {
  test("listToday keeps only today's titles", async () => {
    fake.push([
      { title: "Ana", month: 3, day: 9 },
      { title: "Bia", month: 3, day: 10 },
    ]);
    expect(await BirthdayService.listToday(new Date(2026, 2, 9))).toEqual(["Ana"]);
  });
  test("update/remove return undefined when missing", async () => {
    fake.push([], []);
    const body = { title: "a", month: 1, day: 1 };
    expect(await BirthdayService.update("x", body)).toBeUndefined();
    expect(await BirthdayService.remove("x")).toBeUndefined();
  });
  test("constructor", () => {
    expect(new (BirthdayService as never as new () => object)()).toBeObject();
  });
});

test("job sends today's birthdays", async () => {
  const now = new Date();
  fake.push([{ title: "Ana", month: now.getMonth() + 1, day: now.getDate() }]);
  await sendBirthdayMessage();
  expect(sent).toHaveLength(1);
  expect(sent[0]).toContain("Ana");
});

describe("routes", () => {
  const call = (path: string, init?: RequestInit) =>
    birthdayRoutes.handle(new Request(`http://localhost${path}`, init));
  const json = (method: string, body: unknown) => ({
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const body = { title: "Ana", month: 3, day: 9 };

  test("list", async () => {
    fake.push([{ id: "a" }]);
    expect(await (await call("/api/birthday/list")).json()).toEqual([{ id: "a" }]);
  });
  test("create, patch, delete", async () => {
    fake.push([{ id: "a" }]);
    expect(await (await call("/api/birthday/", json("POST", body))).json()).toEqual({ id: "a" });
    fake.push([{ id: "a" }]);
    expect(await (await call("/api/birthday/a", json("PATCH", body))).json()).toEqual({ id: "a" });
    fake.push([{ id: "a" }]);
    expect(await (await call("/api/birthday/a", { method: "DELETE" })).json()).toEqual({ id: "a" });
  });
  test("404 when missing, 422 on invalid day", async () => {
    fake.push([], []);
    expect((await call("/api/birthday/a", json("PATCH", body))).status).toBe(404);
    expect((await call("/api/birthday/a", { method: "DELETE" })).status).toBe(404);
    expect((await call("/api/birthday/", json("POST", { ...body, month: 4, day: 31 }))).status).toBe(422);
  });
});
