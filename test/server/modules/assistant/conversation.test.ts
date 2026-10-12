import { beforeEach, describe, expect, mock, test } from "bun:test";

import { makeFakeDb } from "../../../helpers/modules-db";

let fake = makeFakeDb();
mock.module("@server/db", () => ({ db: new Proxy({}, { get: (_t, p) => (fake.db as never)[p] }) }));

const { ConversationService, MAX_HISTORY_MESSAGES, TITLE_LENGTH, titleFrom } = await import(
  "@server/modules/assistant/service/conversation"
);

beforeEach(() => {
  fake = makeFakeDb();
});

const conversation = (id: string) => ({
  id,
  userId: "u1",
  title: "t",
  endedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});
const image = (key: string) => ({ key, mediaType: "image/png", source: "upload" as const });

describe("titleFrom", () => {
  test("collapses whitespace and truncates long text", () => {
    expect(titleFrom("  liga   a luz ")).toBe("liga a luz");
    const title = titleFrom("a".repeat(100));
    expect(title).toHaveLength(TITLE_LENGTH);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("ConversationService", () => {
  test("find returns the user's conversation or null", async () => {
    new (ConversationService as unknown as new () => object)();
    fake.push([conversation("c1")], []);
    expect((await ConversationService.find("u1", "c1"))?.id).toBe("c1");
    expect(await ConversationService.find("u1", "nope")).toBeNull();
  });

  test("open continues a requested conversation of the user", async () => {
    fake.push([conversation("c1")]);
    expect((await ConversationService.open("u1", "oi", "c1")).id).toBe("c1");
  });

  test("open resumes a recent conversation, else starts an unsaved one", async () => {
    fake.push([conversation("recent")]);
    expect(await ConversationService.open("u1", "oi")).toMatchObject({ id: "recent", persisted: true });

    fake.push([]);
    const now = new Date("2026-10-11T12:00:00Z");
    const created = await ConversationService.open("u1", "  liga a luz ", undefined, now);
    expect(created).toMatchObject({ userId: "u1", title: "liga a luz", endedAt: null, persisted: false });
    expect(created.createdAt).toBe(now);
    expect(fake.calls).not.toContain("insert");
  });

  test("open starts a new conversation when the requested one is not the user's", async () => {
    fake.push([]);
    const created = await ConversationService.open("u1", "oi", "someone-elses");
    expect(created.persisted).toBe(false);
    expect(created.id).not.toBe("someone-elses");
  });

  test("context returns the latest messages oldest first", async () => {
    fake.push([{ id: "m2" }, { id: "m1" }]);
    expect((await ConversationService.context("c1")).map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(MAX_HISTORY_MESSAGES).toBeGreaterThan(2);
  });

  test("addTurn saves a new conversation with its first turn, in one transaction", async () => {
    const opened = await (fake.push([]), ConversationService.open("u1", "oi"));
    fake.calls.length = 0;
    fake.push(undefined, undefined);
    await ConversationService.addTurn(opened, [{ role: "user", text: "oi" }], false);
    expect(fake.calls).toEqual(["transaction", "insert", "values", "insert", "values"]);
  });

  test("addTurn touches an existing conversation, closing or reopening it", async () => {
    const existing = { ...conversation("c1"), persisted: true };
    fake.push(undefined, undefined);
    await ConversationService.addTurn(
      existing,
      [{ role: "assistant", text: "tchau", actions: [], images: [image("a")] }],
      true,
    );
    fake.push(undefined, undefined);
    await ConversationService.addTurn(existing, [{ role: "user", text: "oi de novo" }], false);
    expect(fake.calls.filter((c) => c === "update")).toHaveLength(2);
    expect(fake.calls.filter((c) => c === "insert")).toHaveLength(2);
  });

  test("referencedImageKeys collects every key in use", async () => {
    fake.push([{ key: "a" }, { key: "b" }, { key: "a" }]);
    expect(await ConversationService.referencedImageKeys()).toEqual(new Set(["a", "b"]));
  });

  test("endAll, list and messages query the user's data", async () => {
    fake.push(undefined, [conversation("c1")], [{ id: "m1" }]);
    await ConversationService.endAll("u1");
    expect((await ConversationService.list("u1")).map((c) => c.id)).toEqual(["c1"]);
    expect(await ConversationService.messages("c1")).toEqual([{ id: "m1" }] as never);
  });

  test("remove deletes the conversation and returns its images", async () => {
    fake.push([conversation("c1")], [{ images: [image("a")] }, { images: [image("b")] }], undefined);
    expect((await ConversationService.remove("u1", "c1"))?.map((i) => i.key)).toEqual(["a", "b"]);
    expect(fake.calls).toContain("delete");

    fake.push([]);
    expect(await ConversationService.remove("u1", "nope")).toBeNull();
  });
});
