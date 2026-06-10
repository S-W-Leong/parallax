import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtifactRecord } from "@/lib/artifacts/artifactTypes";

const buildArtifactState = vi.hoisted(() => ({
  result: null as unknown,
}));

const artifactCommandState = vi.hoisted(() => ({
  commands: [] as Array<{ type: string; componentId?: string; stepId?: string }>,
}));

vi.mock("@openai/agents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@openai/agents")>();
  return {
    ...actual,
    run: vi.fn(),
  };
});

vi.mock("@/lib/agent/tools/buildLearningArtifactTool", () => {
  return {
    makeBuildLearningArtifactToolSink: vi.fn(() => ({
      tool: {},
      getResult: () => buildArtifactState.result,
    })),
  };
});

vi.mock("@/lib/agent/tools/sendArtifactCommandTool", () => {
  return {
    makeSendArtifactCommandSink: vi.fn(() => ({
      tool: {},
      getCommands: () => artifactCommandState.commands,
    })),
  };
});

vi.mock("@/lib/cloud/threadStore", () => {
  return {
    getThreadStore: vi.fn(),
  };
});

const { decodeAgentStreamEvents } = await import("@/lib/agent/streamProtocol");
const { handleAgentRoute, handleAgentRouteStream, handleChatRoute, handleTutorRoute } = await import("@/lib/agent/routes");
const { run } = await import("@openai/agents");
const mockedRun = vi.mocked(run);
const { getThreadStore } = await import("@/lib/cloud/threadStore");
const mockedGetThreadStore = vi.mocked(getThreadStore);

const artifact: ArtifactRecord = {
  id: "artifact-1",
  title: "Inside a Cell",
  topic: "cells",
  summary: "A guided model of cell structures.",
  lessonMode: "guided_walkthrough",
  interactionGoal: "Trace how the cell membrane and nucleus organize the cell.",
  sources: [
    {
      title: "Cell Basics",
      url: "https://example.com/cells",
      summary: "Overview of core organelles.",
    },
  ],
  controls: [
    {
      id: "labels",
      type: "toggle",
      label: "Labels",
      value: true,
    },
  ],
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

const replacementArtifact: ArtifactRecord = {
  ...artifact,
  id: "artifact-2",
  title: "Inside a Corrected Cell",
  summary: "A rebuilt model with corrected geometry.",
  sceneSource: `${artifact.sceneSource}\n// corrected geometry`,
  createdAt: "2026-06-09T13:05:00.000Z",
};

function makeStore(overrides: Record<string, unknown> = {}) {
  return {
    createThread: vi.fn(),
    listThreads: vi.fn(),
    loadThread: vi.fn(),
    archiveThread: vi.fn(),
    appendMessage: vi.fn().mockResolvedValue(undefined),
    saveArtifact: vi.fn().mockResolvedValue(undefined),
    getAgentSessionItems: vi.fn().mockResolvedValue([]),
    appendAgentSessionItems: vi.fn().mockResolvedValue(undefined),
    popAgentSessionItem: vi.fn(),
    clearAgentSession: vi.fn(),
    ...overrides,
  };
}

describe("agent routes", () => {
  const originalKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    mockedRun.mockReset();
    mockedGetThreadStore.mockReset();
    buildArtifactState.result = null;
    artifactCommandState.commands = [];
  });

  afterEach(() => {
    if (originalKey) {
      process.env.OPENAI_API_KEY = originalKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  it("runs the Guide agent with SDK session and chat surface context", async () => {
    const store = makeStore();
    mockedGetThreadStore.mockReturnValue(store);
    mockedRun.mockResolvedValueOnce({ finalOutput: "Hey, I can help you learn STEM topics in 3D." } as Awaited<ReturnType<typeof run>>);

    const response = await handleAgentRoute({
      mode: "chat",
      threadId: "thread-1",
      userId: "demo-1",
      message: "Sup",
      messages: [],
    });

    expect(mockedRun).toHaveBeenCalledTimes(1);
    expect(mockedRun.mock.calls[0]?.[0]).toMatchObject({ name: "Parallax Guide" });
    expect(mockedRun.mock.calls[0]?.[1]).toContain('"surface":"chat"');
    expect(mockedRun.mock.calls[0]?.[2]).toMatchObject({
      maxTurns: 8,
      session: expect.objectContaining({}),
    });
    expect(response).toEqual({
      message: "Hey, I can help you learn STEM topics in 3D.",
      trace: [],
      artifact: null,
      commands: [],
      error: null,
    });
    expect(store.appendMessage).toHaveBeenCalledTimes(2);
  });

  it("passes active learning-room context to the same Guide route and returns commands", async () => {
    mockedRun.mockResolvedValueOnce({ finalOutput: "Let's focus the nucleus." } as Awaited<ReturnType<typeof run>>);
    artifactCommandState.commands = [{ type: "focus_component", componentId: "nucleus" }];

    const response = await handleAgentRoute({
      mode: "learning_room",
      message: "Focus the nucleus",
      artifact,
      messages: [],
      selectedComponent: null,
      activeStepId: "intro",
    });

    expect(mockedRun).toHaveBeenCalledTimes(1);
    expect(mockedRun.mock.calls[0]?.[0]).toMatchObject({ name: "Parallax Guide" });
    const prompt = mockedRun.mock.calls[0]?.[1] as string;
    expect(prompt).toContain('"surface":"learning_room"');
    expect(prompt).toContain('"activeArtifact"');
    expect(prompt).toContain('"activeStep"');
    expect(response).toEqual({
      message: "Let's focus the nucleus.",
      trace: [],
      artifact: null,
      commands: [{ type: "focus_component", componentId: "nucleus" }],
      error: null,
    });
  });

  it("persists Guide-built artifacts before assistant messages that reference them", async () => {
    const appendMessage = vi.fn().mockResolvedValue(undefined);
    const saveArtifact = vi.fn().mockResolvedValue(undefined);
    mockedGetThreadStore.mockReturnValue(makeStore({ appendMessage, saveArtifact }));
    mockedRun.mockResolvedValueOnce({ finalOutput: "I rebuilt the room with corrected geometry." } as Awaited<ReturnType<typeof run>>);
    buildArtifactState.result = {
      ok: true,
      message: "I built Inside a Corrected Cell.",
      trace: ["Generating interactive 3D artifact", "Reviewing artifact accuracy"],
      artifact: replacementArtifact,
    };

    const response = await handleAgentRoute({
      mode: "learning_room",
      threadId: "thread-1",
      userId: "demo-1",
      message: "Rebuild this with clearer geometry",
      artifact,
      messages: [],
      selectedComponent: null,
      activeStepId: "intro",
    });

    expect(response).toMatchObject({
      message: "I rebuilt the room with corrected geometry.",
      artifact: { id: "artifact-2" },
      trace: ["Generating interactive 3D artifact", "Reviewing artifact accuracy"],
      error: null,
    });
    expect(saveArtifact).toHaveBeenCalledWith("demo-1", "thread-1", replacementArtifact);
    expect(appendMessage).toHaveBeenCalledTimes(2);
    expect(appendMessage.mock.invocationCallOrder[0]).toBeLessThan(saveArtifact.mock.invocationCallOrder[0]);
    expect(saveArtifact.mock.invocationCallOrder[0]).toBeLessThan(appendMessage.mock.invocationCallOrder[1]);
    expect(appendMessage.mock.calls[1][2]).toMatchObject({
      role: "assistant",
      artifactId: replacementArtifact.id,
    });
  });

  it("persists Guide build failures without saving artifacts", async () => {
    const appendMessage = vi.fn().mockResolvedValue(undefined);
    const saveArtifact = vi.fn().mockResolvedValue(undefined);
    mockedGetThreadStore.mockReturnValue(makeStore({ appendMessage, saveArtifact }));
    mockedRun.mockResolvedValueOnce({ finalOutput: "I found a build issue." } as Awaited<ReturnType<typeof run>>);
    buildArtifactState.result = {
      ok: false,
      message: "Artifact validation failed: missing registerComponent call.",
      trace: ["Generating interactive 3D artifact", "Repairing artifact from validator feedback"],
      error: "Artifact validation failed: missing registerComponent call.",
    };

    const response = await handleAgentRoute({
      mode: "chat",
      threadId: "thread-1",
      userId: "demo-1",
      message: "Build a cell room",
      messages: [],
    });

    expect(response).toEqual({
      message: "Artifact validation failed: missing registerComponent call.",
      trace: ["Generating interactive 3D artifact", "Repairing artifact from validator feedback"],
      artifact: null,
      commands: [],
      error: "Artifact validation failed: missing registerComponent call.",
    });
    expect(saveArtifact).not.toHaveBeenCalled();
    expect(appendMessage).toHaveBeenCalledTimes(2);
  });

  it("rejects partial threaded context during route parsing", async () => {
    await expect(handleAgentRoute({
      mode: "chat",
      message: "Teach me cells",
      messages: [],
      userId: "demo-1",
    })).rejects.toThrow(/threadId/i);

    await expect(handleAgentRoute({
      mode: "chat",
      message: "Teach me cells",
      messages: [],
      threadId: "thread-1",
    })).rejects.toThrow(/userId/i);
  });

  it("keeps legacy route wrappers mapped to the unified Guide route", async () => {
    mockedRun
      .mockResolvedValueOnce({ finalOutput: "Chat wrapper uses Guide." } as Awaited<ReturnType<typeof run>>)
      .mockResolvedValueOnce({ finalOutput: "Tutor wrapper uses Guide." } as Awaited<ReturnType<typeof run>>);

    await expect(handleChatRoute({ message: "Sup", messages: [] })).resolves.toMatchObject({
      message: "Chat wrapper uses Guide.",
    });
    await expect(handleTutorRoute({
      message: "Focus membrane",
      artifact,
      messages: [],
      selectedComponent: null,
      activeStepId: "intro",
    })).resolves.toMatchObject({
      message: "Tutor wrapper uses Guide.",
    });

    expect(mockedRun.mock.calls[0]?.[0]).toMatchObject({ name: "Parallax Guide" });
    expect(mockedRun.mock.calls[1]?.[0]).toMatchObject({ name: "Parallax Guide" });
  });

  it("streams Guide deltas and emits the final artifact result", async () => {
    const streamedResult = {
      async *[Symbol.asyncIterator]() {
        yield { type: "agent_updated_stream_event", agent: { name: "Parallax Guide" } };
        yield { type: "text_delta", delta: "I built " };
        yield { type: "text_delta", delta: "a corrected room." };
      },
      completed: Promise.resolve(),
      finalOutput: "I built a corrected room.",
    };
    mockedRun.mockResolvedValueOnce(streamedResult as Awaited<ReturnType<typeof run>>);
    buildArtifactState.result = {
      ok: true,
      message: "I built Inside a Corrected Cell.",
      trace: ["Generating interactive 3D artifact", "Reviewing artifact accuracy"],
      artifact: replacementArtifact,
    };

    const stream = handleAgentRouteStream({
      mode: "chat",
      message: "Build a corrected room",
      messages: [],
    });
    const events = decodeAgentStreamEvents(await new Response(stream).text());

    expect(events).toEqual([
      { type: "status", message: "Thinking..." },
      { type: "trace", entry: { kind: "agent", label: "Using Parallax Guide" } },
      { type: "delta", delta: "I built " },
      { type: "delta", delta: "a corrected room." },
      {
        type: "done",
        message: "I built a corrected room.",
        trace: ["Generating interactive 3D artifact", "Reviewing artifact accuracy"],
        artifact: replacementArtifact,
        commands: [],
        error: null,
      },
    ]);
  });

  it("streams a done event with an error instead of crashing the stream", async () => {
    mockedRun.mockRejectedValueOnce(new Error("Model unavailable"));

    const stream = handleAgentRouteStream({
      mode: "chat",
      message: "Teach me cells",
      messages: [],
    });
    const events = decodeAgentStreamEvents(await new Response(stream).text());

    expect(events).toEqual([
      { type: "status", message: "Thinking..." },
      { type: "error", message: "Model unavailable" },
      { type: "done", message: "Model unavailable", trace: [], artifact: null, commands: [], error: "Model unavailable" },
    ]);
  });

  it("aborts the Guide streaming run when the response stream is canceled", async () => {
    let runSignal: AbortSignal | undefined;
    mockedRun.mockImplementationOnce(async (_agent, _prompt, options) => {
      runSignal = options?.signal;
      return {
        async *[Symbol.asyncIterator]() {
          await new Promise<void>((resolve) => {
            options?.signal?.addEventListener("abort", () => resolve(), { once: true });
          });
        },
        completed: new Promise<void>((resolve) => {
          options?.signal?.addEventListener("abort", () => resolve(), { once: true });
        }),
        finalOutput: "Canceled",
      } as Awaited<ReturnType<typeof run>>;
    });

    const stream = handleAgentRouteStream({
      mode: "chat",
      message: "Teach me cells",
      messages: [],
    });
    const reader = stream.getReader();
    await reader.read();

    expect(runSignal?.aborted).toBe(false);
    await reader.cancel();
    expect(runSignal?.aborted).toBe(true);
  });
});
