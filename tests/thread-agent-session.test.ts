import { describe, expect, it, vi } from "vitest";
import type { AgentInputItem } from "@openai/agents";
import { ThreadAgentSession } from "@/lib/agent/threadAgentSession";
import type { ThreadStore } from "@/lib/cloud/threadStore";

const firstItem = {
  type: "message",
  role: "user",
  content: "Teach me mitochondria",
} satisfies AgentInputItem;

const secondItem = {
  type: "message",
  role: "assistant",
  status: "completed",
  content: [{ type: "output_text", text: "Mitochondria convert fuel into ATP." }],
} satisfies AgentInputItem;

function makeStore(): ThreadStore {
  const items: AgentInputItem[] = [];
  return {
    createThread: vi.fn(),
    listThreads: vi.fn(),
    loadThread: vi.fn(),
    archiveThread: vi.fn(),
    appendMessage: vi.fn(),
    saveArtifact: vi.fn(),
    getAgentSessionItems: vi.fn(async (_userId, _threadId, limit) => items.slice(limit ? -limit : 0)),
    appendAgentSessionItems: vi.fn(async (_userId, _threadId, nextItems) => {
      items.push(...nextItems);
    }),
    popAgentSessionItem: vi.fn(async () => items.pop()),
    clearAgentSession: vi.fn(async () => {
      items.length = 0;
    }),
  };
}

describe("ThreadAgentSession", () => {
  it("stores SDK session history in the owning thread", async () => {
    const store = makeStore();
    const session = new ThreadAgentSession({
      userId: "demo-1",
      threadId: "thread-1",
      store,
    });

    await expect(session.getSessionId()).resolves.toBe("thread-1");

    await session.addItems([firstItem, secondItem]);

    await expect(session.getItems()).resolves.toEqual([firstItem, secondItem]);
    await expect(session.getItems(1)).resolves.toEqual([secondItem]);
    await expect(session.popItem()).resolves.toEqual(secondItem);
    await expect(session.getItems()).resolves.toEqual([firstItem]);

    await session.clearSession();

    await expect(session.getItems()).resolves.toEqual([]);
    expect(store.appendAgentSessionItems).toHaveBeenCalledWith("demo-1", "thread-1", [firstItem, secondItem]);
    expect(store.clearAgentSession).toHaveBeenCalledWith("demo-1", "thread-1");
  });
});
