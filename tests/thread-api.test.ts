import { describe, expect, it, vi } from "vitest";
import { DELETE as deleteThread, GET as getThread } from "@/app/api/threads/[threadId]/route";
import { GET as listThreads, POST as createThread } from "@/app/api/threads/route";
import { AwsThreadStore, type ThreadStore } from "@/lib/cloud/threadStore";

vi.mock("@/lib/cloud/threadStore", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/cloud/threadStore")>();
  return {
    ...actual,
    getThreadStore: vi.fn(),
  };
});

const { getThreadStore } = await import("@/lib/cloud/threadStore");
const mockedGetThreadStore = vi.mocked(getThreadStore);

function mockStore(overrides: Partial<ThreadStore>): ThreadStore {
  return {
    createThread: vi.fn(),
    listThreads: vi.fn(),
    loadThread: vi.fn(),
    archiveThread: vi.fn(),
    appendMessage: vi.fn(),
    saveArtifact: vi.fn(),
    ...overrides,
  };
}

function threadContext(threadId: string) {
  return { params: Promise.resolve({ threadId }) };
}

describe("thread API routes", () => {
  it("GET /api/threads?userId=demo-1 lists active threads", async () => {
    const store = mockStore({
      listThreads: vi.fn().mockResolvedValue([{ id: "thread-1", title: "Cells", createdAt: "a", updatedAt: "b" }]),
    });
    mockedGetThreadStore.mockReturnValue(store);

    const response = await listThreads(new Request("http://localhost/api/threads?userId=demo-1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      threads: [{ id: "thread-1", title: "Cells", createdAt: "a", updatedAt: "b" }],
    });
    expect(store.listThreads).toHaveBeenCalledWith("demo-1");
  });

  it("GET /api/threads returns 400 when userId is missing", async () => {
    const response = await listThreads(new Request("http://localhost/api/threads"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "userId is required" });
  });

  it("POST /api/threads creates a thread and returns it", async () => {
    const thread = { id: "thread-1", title: "Cells", createdAt: "2026-06-09T14:00:00.000Z", updatedAt: "2026-06-09T14:00:00.000Z" };
    const store = mockStore({
      createThread: vi.fn().mockResolvedValue(thread),
    });
    mockedGetThreadStore.mockReturnValue(store);

    const response = await createThread(
      new Request("http://localhost/api/threads", {
        method: "POST",
        body: JSON.stringify({ userId: "demo-1", title: "Cells" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ thread });
    expect(store.createThread).toHaveBeenCalledWith({
      userId: "demo-1",
      title: "Cells",
      now: expect.any(String),
      threadId: expect.any(String),
    });
  });

  it("GET /api/threads/[threadId] loads a thread and returns a session", async () => {
    const store = mockStore({
      loadThread: vi.fn().mockResolvedValue({
        threadId: "thread-1",
        messages: [{ id: "message-1", role: "user", content: "Teach me cells", createdAt: "2026-06-09T14:00:00.000Z" }],
        artifacts: [],
      }),
    });
    mockedGetThreadStore.mockReturnValue(store);

    const response = await getThread(new Request("http://localhost/api/threads/thread-1?userId=demo-1"), threadContext("thread-1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      session: {
        id: "thread-1",
        mode: "chat",
        messages: [{ id: "message-1", role: "user", content: "Teach me cells", createdAt: "2026-06-09T14:00:00.000Z" }],
        artifacts: {},
      },
    });
    expect(store.loadThread).toHaveBeenCalledWith("demo-1", "thread-1");
  });

  it("GET /api/threads/[threadId] returns 400 when userId is missing", async () => {
    const response = await getThread(new Request("http://localhost/api/threads/thread-1"), threadContext("thread-1"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "userId is required" });
  });

  it("DELETE /api/threads/[threadId]?userId=demo-1 archives a thread", async () => {
    const store = mockStore({
      archiveThread: vi.fn().mockResolvedValue(undefined),
    });
    mockedGetThreadStore.mockReturnValue(store);

    const response = await deleteThread(new Request("http://localhost/api/threads/thread-1?userId=demo-1"), threadContext("thread-1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(store.archiveThread).toHaveBeenCalledWith("demo-1", "thread-1", expect.any(String));
  });
});

describe("thread API store commands", () => {
  it("archiveThread only updates an existing thread summary", async () => {
    const dynamo = { send: vi.fn().mockResolvedValue({}) };
    const s3 = { send: vi.fn().mockResolvedValue({}) };
    const store = new AwsThreadStore({ dynamo, s3, tableName: "threads-table", bucketName: "artifact-bucket" });

    await store.archiveThread("demo-1", "thread-1", "2026-06-09T14:00:00.000Z");

    expect(dynamo.send.mock.calls[0][0].input).toMatchObject({
      TableName: "threads-table",
      Key: {
        PK: "USER#demo-1",
        SK: "THREAD#thread-1",
      },
      UpdateExpression: "SET archivedAt = :archivedAt",
      ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)",
      ExpressionAttributeValues: {
        ":archivedAt": "2026-06-09T14:00:00.000Z",
      },
    });
  });
});
