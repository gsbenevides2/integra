import { afterEach, expect, spyOn, test } from "bun:test";

const { sweepAssistantImages } = await import("@server/modules/assistant/jobs/sweepImages");
const { ConversationService } = await import("@server/modules/assistant/service/conversation");

const spies: { mockRestore: () => void }[] = [];
afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

test("sweeps the bucket keeping every image a message refers to", async () => {
  const referenced = new Set(["assistant/u1/upload/kept.jpg"]);
  const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  spies.push(
    spyOn(ConversationService, "referencedImageKeys").mockResolvedValue(referenced),
    spyOn(Bun.s3, "list").mockResolvedValue({
      contents: [
        { key: "assistant/u1/upload/kept.jpg", lastModified: old },
        { key: "assistant/u1/upload/orphan.jpg", lastModified: old },
      ],
    } as never),
  );
  const remove = spyOn(Bun.s3, "delete").mockResolvedValue(undefined as never);
  spies.push(remove);
  await sweepAssistantImages();
  expect(remove.mock.calls).toEqual([["assistant/u1/upload/orphan.jpg"]] as never);
});
