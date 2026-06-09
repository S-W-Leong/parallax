import { describe, expect, it, vi } from "vitest";
import { createSessionFromThread } from "@/lib/threads/threadSession";

vi.mock("@/lib/cloud/threadStore", () => {
  return {
    getThreadStore: vi.fn(),
  };
});

const { getThreadStore } = await import("@/lib/cloud/threadStore");
const mockedGetThreadStore = vi.mocked(getThreadStore);

describe("thread API contract helpers", () => {
  it("can convert a loaded persisted thread into the session returned by GET /api/threads/[threadId]", () => {
    const session = createSessionFromThread({
      threadId: "thread-1",
      messages: [{ id: "message-1", role: "user", content: "Teach me cells", createdAt: "2026-06-09T14:00:00.000Z" }],
      artifacts: [],
    });

    expect(session.id).toBe("thread-1");
    expect(session.messages).toHaveLength(1);
  });

  it("uses a store object that can be mocked for route tests", async () => {
    mockedGetThreadStore.mockReturnValue({
      createThread: vi.fn(),
      listThreads: vi.fn().mockResolvedValue([{ id: "thread-1", title: "Cells", createdAt: "a", updatedAt: "b" }]),
      loadThread: vi.fn(),
      archiveThread: vi.fn(),
      appendMessage: vi.fn(),
      saveArtifact: vi.fn(),
    });

    const store = mockedGetThreadStore();
    await expect(store.listThreads("demo-1")).resolves.toEqual([{ id: "thread-1", title: "Cells", createdAt: "a", updatedAt: "b" }]);
  });
});
