import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtifactRecord } from "@/lib/artifacts/artifactTypes";

const createExperienceState = vi.hoisted(() => ({
  result: null as unknown,
}));

vi.mock("@openai/agents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@openai/agents")>();
  return {
    ...actual,
    run: vi.fn(),
  };
});

vi.mock("@/lib/agent/tools/createExperienceTool", () => {
  return {
    makeCreateExperienceToolSink: vi.fn(() => ({
      tool: {},
      getResult: () => createExperienceState.result,
    })),
  };
});

vi.mock("@/lib/cloud/threadStore", () => {
  return {
    getThreadStore: vi.fn(),
  };
});

const { decodeAgentStreamEvents } = await import("@/lib/agent/streamProtocol");
const { handleAgentRoute, handleAgentRouteStream, handleChatRoute } = await import("@/lib/agent/routes");
const { run } = await import("@openai/agents");
const mockedRun = vi.mocked(run);
const { getThreadStore } = await import("@/lib/cloud/threadStore");
const mockedGetThreadStore = vi.mocked(getThreadStore);

const artifact: ArtifactRecord = {
  id: "artifact-1",
  title: "Inside a Cell",
  topic: "cells",
  summary: "A guided model of cell structures.",
  sceneSource: "registerComponent('a','A',root,{}); setWalkthroughSteps([]);",
  html: "<!doctype html><html><body>artifact</body></html>",
  components: [
    { id: "membrane", label: "Cell membrane" },
    { id: "nucleus", label: "Nucleus" },
    { id: "ribosome", label: "Ribosome" },
  ],
  walkthroughSteps: [
    { id: "intro", title: "Start", narration: "Begin at the membrane.", targetComponentIds: ["membrane"] },
  ],
  createdAt: "2026-06-09T13:00:00.000Z",
};

describe("agent routes", () => {
  const originalKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    mockedRun.mockReset();
    mockedGetThreadStore.mockReset();
    createExperienceState.result = null;
  });

  afterEach(() => {
    if (originalKey) {
      process.env.OPENAI_API_KEY = originalKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  it("lets the main agent answer without creating an experience", async () => {
    mockedRun.mockResolvedValueOnce({ finalOutput: "Hey, I can help you learn STEM topics in 3D." } as Awaited<ReturnType<typeof run>>);

    const response = await handleAgentRoute({ mode: "chat", message: "Sup", messages: [] });

    expect(response).toEqual({
      message: "Hey, I can help you learn STEM topics in 3D.",
      trace: [],
      artifact: null,
      error: null,
    });
  });

  it("answers learning-room questions through the same route contract", async () => {
    mockedRun.mockResolvedValueOnce({ finalOutput: "The nucleus stores the genetic instructions." } as Awaited<ReturnType<typeof run>>);

    const response = await handleAgentRoute({
      mode: "learning_room",
      message: "What does the nucleus do?",
      artifact,
      messages: [],
      selectedComponent: { artifactId: artifact.id, id: "nucleus", label: "Nucleus" },
      activeStepId: "intro",
    });

    expect(response).toEqual({
      message: "The nucleus stores the genetic instructions.",
      commands: [],
    });
  });

  it("persists user and assistant messages when a threadId is present", async () => {
    const appendMessage = vi.fn().mockResolvedValue(undefined);
    mockedGetThreadStore.mockReturnValue({
      createThread: vi.fn(),
      listThreads: vi.fn(),
      loadThread: vi.fn(),
      archiveThread: vi.fn(),
      appendMessage,
      saveArtifact: vi.fn(),
    });
    mockedRun.mockResolvedValueOnce({ finalOutput: "Sure, let's explore turbines." } as Awaited<ReturnType<typeof run>>);

    await handleAgentRoute({
      mode: "chat",
      threadId: "thread-1",
      userId: "demo-1",
      message: "Teach me turbines",
      messages: [],
    });

    expect(appendMessage).toHaveBeenCalledTimes(2);
    expect(appendMessage.mock.calls[0][0]).toBe("demo-1");
    expect(appendMessage.mock.calls[0][1]).toBe("thread-1");
    expect(appendMessage.mock.calls[0][2]).toMatchObject({ role: "user", content: "Teach me turbines" });
    expect(appendMessage.mock.calls[1][2]).toMatchObject({ role: "assistant", content: "Sure, let's explore turbines." });
  });

  it("persists artifacts before assistant messages that reference them", async () => {
    const appendMessage = vi.fn().mockResolvedValue(undefined);
    const saveArtifact = vi.fn().mockResolvedValue(undefined);
    mockedGetThreadStore.mockReturnValue({
      createThread: vi.fn(),
      listThreads: vi.fn(),
      loadThread: vi.fn(),
      archiveThread: vi.fn(),
      appendMessage,
      saveArtifact,
    });
    createExperienceState.result = { ok: true, artifact };
    mockedRun.mockResolvedValueOnce({ finalOutput: "I built a guided cell room." } as Awaited<ReturnType<typeof run>>);

    await handleAgentRoute({
      mode: "chat",
      threadId: "thread-1",
      userId: "demo-1",
      message: "Build a cell room",
      messages: [],
    });

    expect(saveArtifact).toHaveBeenCalledWith("demo-1", "thread-1", artifact);
    expect(appendMessage).toHaveBeenCalledTimes(2);
    expect(appendMessage.mock.calls[1][2]).toMatchObject({
      role: "assistant",
      content: "I built a guided cell room.",
      artifactId: artifact.id,
    });
    expect(appendMessage.mock.invocationCallOrder[0]).toBeLessThan(saveArtifact.mock.invocationCallOrder[0]);
    expect(saveArtifact.mock.invocationCallOrder[0]).toBeLessThan(appendMessage.mock.invocationCallOrder[1]);
  });

  it("does not append an artifact-linked assistant message when artifact persistence fails", async () => {
    const appendMessage = vi.fn().mockResolvedValue(undefined);
    const saveArtifact = vi.fn().mockRejectedValue(new Error("Artifact upload failed"));
    mockedGetThreadStore.mockReturnValue({
      createThread: vi.fn(),
      listThreads: vi.fn(),
      loadThread: vi.fn(),
      archiveThread: vi.fn(),
      appendMessage,
      saveArtifact,
    });
    createExperienceState.result = { ok: true, artifact };
    mockedRun.mockResolvedValueOnce({ finalOutput: "I built a guided cell room." } as Awaited<ReturnType<typeof run>>);

    await expect(handleAgentRoute({
      mode: "chat",
      threadId: "thread-1",
      userId: "demo-1",
      message: "Build a cell room",
      messages: [],
    })).rejects.toThrow("Artifact upload failed");

    expect(appendMessage).toHaveBeenCalledTimes(1);
    expect(appendMessage.mock.calls[0][2]).toMatchObject({ role: "user", content: "Build a cell room" });
    expect(saveArtifact).toHaveBeenCalledWith("demo-1", "thread-1", artifact);
  });

  it("persists learning-room user and assistant messages when threaded", async () => {
    const appendMessage = vi.fn().mockResolvedValue(undefined);
    mockedGetThreadStore.mockReturnValue({
      createThread: vi.fn(),
      listThreads: vi.fn(),
      loadThread: vi.fn(),
      archiveThread: vi.fn(),
      appendMessage,
      saveArtifact: vi.fn(),
    });
    mockedRun.mockResolvedValueOnce({ finalOutput: "The membrane controls what enters and exits." } as Awaited<ReturnType<typeof run>>);

    await handleAgentRoute({
      mode: "learning_room",
      threadId: "thread-1",
      userId: "demo-1",
      message: "What does the membrane do?",
      artifact,
      messages: [],
      selectedComponent: { artifactId: artifact.id, id: "membrane", label: "Cell membrane" },
      activeStepId: "intro",
    });

    expect(appendMessage).toHaveBeenCalledTimes(2);
    expect(appendMessage.mock.calls[0][0]).toBe("demo-1");
    expect(appendMessage.mock.calls[0][1]).toBe("thread-1");
    expect(appendMessage.mock.calls[0][2]).toMatchObject({ role: "user", content: "What does the membrane do?", artifactId: artifact.id });
    expect(appendMessage.mock.calls[1][2]).toMatchObject({ role: "assistant", content: "The membrane controls what enters and exits.", artifactId: artifact.id });
  });

  it("keeps the old chat route wrapper working", async () => {
    mockedRun.mockResolvedValueOnce({ finalOutput: "Old route still answers." } as Awaited<ReturnType<typeof run>>);

    const response = await handleChatRoute({ message: "Sup", messages: [] });

    expect(response).toEqual({
      message: "Old route still answers.",
      trace: [],
      artifact: null,
      error: null,
    });
  });

  it("streams status, deltas, and a done event for chat mode", async () => {
    const streamResult = {
      finalOutput: "Let us explore cells.",
      completed: Promise.resolve(),
      error: null,
      toTextStream: () =>
        new ReadableStream<string>({
          start(controller) {
            controller.enqueue("Let us ");
            controller.enqueue("explore cells.");
            controller.close();
          },
        }),
    };
    mockedRun.mockResolvedValueOnce(streamResult as never);

    const response = handleAgentRouteStream({ mode: "chat", message: "Teach me cells", messages: [] });
    const events = decodeAgentStreamEvents(await new Response(response).text());

    expect(mockedRun).toHaveBeenCalledWith(expect.anything(), expect.any(String), { maxTurns: 8, stream: true });
    expect(events).toEqual([
      { type: "status", message: "Planning the learning experience..." },
      { type: "delta", delta: "Let us " },
      { type: "delta", delta: "explore cells." },
      {
        type: "done",
        message: "Let us explore cells.",
        trace: [],
        artifact: null,
        commands: [],
        error: null,
      },
    ]);
  });

  it("streams a done event with an error instead of crashing the stream", async () => {
    mockedRun.mockRejectedValueOnce(new Error("Model unavailable"));

    const response = handleAgentRouteStream({ mode: "chat", message: "Teach me cells", messages: [] });
    const events = decodeAgentStreamEvents(await new Response(response).text());

    expect(events).toEqual([
      { type: "status", message: "Planning the learning experience..." },
      { type: "error", message: "Model unavailable" },
      {
        type: "done",
        message: "Model unavailable",
        trace: [],
        artifact: null,
        commands: [],
        error: "Model unavailable",
      },
    ]);
  });
});
