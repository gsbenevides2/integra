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

  test("open resumes a recent conversation, else creates one", async () => {
    fake.push([conversation("recent")]);
    expect((await ConversationService.open("u1", "oi")).id).toBe("recent");

    fake.push([], [conversation("new")]);
    expect((await ConversationService.open("u1", "oi")).id).toBe("new");
    expect(fake.calls).toContain("insert");
  });

  test("open starts a new conversation when the requested one is not the user's", async () => {
    fake.push([], [conversation("recent")], [conversation("new")]);
    expect((await ConversationService.open("u1", "oi", "someone-elses")).id).toBe("new");
  });

  test("open fails loudly if the insert returns nothing", async () => {
    fake.push([], []);
    await expect(ConversationService.open("u1", "oi")).rejects.toThrow("Conversation not created");
  });

  test("context returns the latest messages oldest first", async () => {
    fake.push([{ id: "m2" }, { id: "m1" }]);
    expect((await ConversationService.context("c1")).map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(MAX_HISTORY_MESSAGES).toBeGreaterThan(2);
  });

  test("addTurn saves messages and touches (or closes) the conversation", async () => {
    fake.push(undefined, undefined);
    await ConversationService.addTurn("c1", [{ role: "user", text: "oi" }], false);
    fake.push(undefined, undefined);
    await ConversationService.addTurn(
      "c1",
      [{ role: "assistant", text: "tchau", actions: [], images: [image("a")] }],
      true,
    );
    expect(fake.calls.filter((c) => c === "insert")).toHaveLength(2);
    expect(fake.calls.filter((c) => c === "update")).toHaveLength(2);
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
