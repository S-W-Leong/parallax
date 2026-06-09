import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleAgentRoute } from "@/lib/agent/routes";
import type { ArtifactRecord } from "@/lib/artifacts/artifactTypes";

vi.mock("@openai/agents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@openai/agents")>();
  return {
    ...actual,
    run: vi.fn(),
  };
});

vi.mock("@/lib/cloud/threadStore", () => {
  return {
    getThreadStore: vi.fn(),
  };
});

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
    expect(appendMessage.mock.calls[0][0]).toBe("thread-1");
    expect(appendMessage.mock.calls[0][1]).toMatchObject({ role: "user", content: "Teach me turbines" });
    expect(appendMessage.mock.calls[1][1]).toMatchObject({ role: "assistant", content: "Sure, let's explore turbines." });
  });
});
