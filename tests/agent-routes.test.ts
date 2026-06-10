import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtifactRecord } from "@/lib/artifacts/artifactTypes";

const createExperienceState = vi.hoisted(() => ({
  result: null as unknown,
  results: [] as unknown[],
  clearCount: 0,
}));

const lessonPlanState = vi.hoisted(() => ({
  result: null as unknown,
}));

const artifactCritiqueState = vi.hoisted(() => ({
  results: [] as unknown[],
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

vi.mock("@/lib/agent/tools/createExperienceTool", () => {
  return {
    makeCreateExperienceToolSink: vi.fn(() => ({
      tool: {},
      getResult: () => createExperienceState.results.shift() ?? createExperienceState.result,
      clearResult: () => {
        createExperienceState.result = null;
        createExperienceState.clearCount += 1;
      },
    })),
  };
});

vi.mock("@/lib/agent/tools/lessonPlanTool", () => {
  return {
    makeLessonPlanToolSink: vi.fn(() => ({
      tool: {},
      getResult: () => lessonPlanState.result,
    })),
  };
});

vi.mock("@/lib/agent/tools/artifactCritiqueTool", () => {
  return {
    makeArtifactCritiqueToolSink: vi.fn(() => ({
      tool: {},
      getResult: () => artifactCritiqueState.results.shift() ?? null,
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
const { handleAgentRoute, handleAgentRouteStream, handleChatRoute } = await import("@/lib/agent/routes");
const { run } = await import("@openai/agents");
const mockedRun = vi.mocked(run);
const { makeCreateExperienceToolSink } = await import("@/lib/agent/tools/createExperienceTool");
const mockedMakeCreateExperienceToolSink = vi.mocked(makeCreateExperienceToolSink);
const { makeArtifactCritiqueToolSink } = await import("@/lib/agent/tools/artifactCritiqueTool");
const mockedMakeArtifactCritiqueToolSink = vi.mocked(makeArtifactCritiqueToolSink);
const { getThreadStore } = await import("@/lib/cloud/threadStore");
const mockedGetThreadStore = vi.mocked(getThreadStore);

function extractJsonAfterPrefix<T>(value: unknown, prefix: string): T {
  if (typeof value !== "string") {
    throw new Error(`Expected prompt to be a string, received ${typeof value}.`);
  }

  const start = value.indexOf(prefix);
  if (start < 0) {
    throw new Error(`Could not find prefix ${JSON.stringify(prefix)} in prompt.`);
  }

  const jsonStart = start + prefix.length;
  const jsonEnd = value.indexOf("\n\n", jsonStart);
  const jsonText = (jsonEnd >= 0 ? value.slice(jsonStart, jsonEnd) : value.slice(jsonStart)).trim();
  return JSON.parse(jsonText) as T;
}

function parseTutorContext(prompt: unknown) {
  return extractJsonAfterPrefix<{
    mode: string;
    artifact: {
      title: string;
      topic: string;
      summary: string;
      lessonMode: string;
      interactionGoal: string;
      controls: unknown[];
      sources: unknown[];
      walkthroughSteps: unknown[];
      components: unknown[];
      sceneSource: string;
    };
    selectedComponent: { artifactId: string; id: string; label: string } | null;
    activeStep: { id: string; title: string; narration: string; targetComponentIds: string[] } | null;
    conversation: string;
  }>(prompt, "Context:\n");
}

function parseBuilderLessonPlan(prompt: unknown) {
  return extractJsonAfterPrefix<{
    artifactNeeded: boolean;
    lessonMode: string;
    title: string;
    topic: string;
    interactionGoal: string;
    builderBrief: string;
  }>(prompt, "Lesson plan:\n");
}

const mechanismSpec = {
  topic: "cell biology",
  sourceClaims: [
    { claim: "The cell membrane regulates exchange with the environment.", sourceUrl: "https://example.com/cells" },
  ],
  components: [
    { id: "membrane", label: "Cell membrane", role: "Regulates exchange.", visualCues: ["outer boundary"], spatialHints: ["surrounds cell interior"] },
    { id: "nucleus", label: "Nucleus", role: "Stores genetic instructions.", visualCues: ["central sphere"], spatialHints: ["inside membrane"] },
    { id: "ribosome", label: "Ribosome", role: "Builds proteins.", visualCues: ["small dots"], spatialHints: ["distributed in cytoplasm"] },
  ],
  relationships: [
    { fromComponentId: "membrane", toComponentId: "nucleus", relationship: "contains", explanation: "The membrane encloses the cell interior that contains the nucleus." },
  ],
  flows: [
    { medium: "materials", pathComponentIds: ["membrane", "ribosome"], direction: "through membrane into the cell", causeEffect: "Material exchange supports protein synthesis." },
  ],
  learnerInteractions: [
    { type: "walkthrough_step", purpose: "Move from cell boundary to information storage and protein synthesis." },
  ],
};

const approvedCritique = {
  approved: true,
  factualIssues: [],
  visualIssues: [],
  interactionIssues: [],
  missingComponents: [],
  repairInstructions: undefined,
};

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

describe("agent routes", () => {
  const originalKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    mockedRun.mockReset();
    mockedGetThreadStore.mockReset();
    mockedMakeCreateExperienceToolSink.mockClear();
    mockedMakeArtifactCritiqueToolSink.mockClear();
    createExperienceState.result = null;
    createExperienceState.results = [];
    createExperienceState.clearCount = 0;
    lessonPlanState.result = null;
    artifactCritiqueState.results = [approvedCritique];
    artifactCommandState.commands = [];
  });

  afterEach(() => {
    if (originalKey) {
      process.env.OPENAI_API_KEY = originalKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  it("planner can answer directly without running builder", async () => {
    mockedRun.mockResolvedValueOnce({ finalOutput: "Hey, I can help you learn STEM topics in 3D." } as Awaited<ReturnType<typeof run>>);

    const response = await handleAgentRoute({ mode: "chat", message: "Sup", messages: [] });

    expect(mockedRun).toHaveBeenCalledTimes(1);
    expect(response).toEqual({
      message: "Hey, I can help you learn STEM topics in 3D.",
      trace: [],
      artifact: null,
      error: null,
    });
  });

  it("plans then builds an artifact when the planner selects a lesson mode", async () => {
    lessonPlanState.result = {
      ok: true,
      plan: {
        artifactNeeded: true,
        lessonMode: "playground",
        title: "Elastic Potential Energy Playground",
        topic: "elastic potential energy",
        rationale: "This concept lands best when the learner can manipulate displacement.",
        interactionGoal: "Change displacement and watch stored energy update.",
        researchUsed: false,
        sources: [],
        requiredComponents: ["spring", "mass", "energy bar"],
        mechanismSpec: {
          topic: "elastic potential energy",
          sourceClaims: [
            { claim: "Elastic potential energy increases with the square of displacement.", sourceUrl: undefined },
          ],
          components: [
            { id: "spring", label: "Spring", role: "Stores elastic energy.", visualCues: ["coiled metal"], spatialHints: ["left of mass"] },
            { id: "mass", label: "Mass", role: "Applies displacement.", visualCues: ["movable block"], spatialHints: ["attached to spring"] },
            { id: "energy-bar", label: "Energy Bar", role: "Shows stored energy.", visualCues: ["height-changing bar"], spatialHints: ["beside spring"] },
          ],
          relationships: [
            { fromComponentId: "mass", toComponentId: "spring", relationship: "transfers_energy_to", explanation: "Displacing the mass deforms the spring." },
          ],
          flows: [
            { medium: "mechanical work", pathComponentIds: ["mass", "spring"], direction: "from mass into spring", causeEffect: "More displacement stores more energy." },
          ],
          learnerInteractions: [
            { type: "slider", purpose: "Change displacement." },
          ],
        },
        builderBrief: "Build a spring-mass playground with a displacement slider and energy bar.",
      },
    };
    createExperienceState.result = {
      ok: true,
      artifact: {
        ...artifact,
        id: "artifact-2",
        title: "Elastic Potential Energy Playground",
        topic: "elastic potential energy",
        summary: "Adjust displacement and see energy stored in the spring.",
        lessonMode: "playground",
        interactionGoal: "Change displacement and watch stored energy update.",
        sources: [],
        controls: [
          {
            id: "displacement",
            type: "range",
            label: "Displacement",
            min: -2,
            max: 2,
            step: 0.1,
            value: 1,
          },
        ],
        walkthroughSteps: [],
      },
    };
    mockedRun
      .mockResolvedValueOnce({ finalOutput: "I will turn this into a playground." } as Awaited<ReturnType<typeof run>>)
      .mockResolvedValueOnce({ finalOutput: "I built a spring-energy playground." } as Awaited<ReturnType<typeof run>>)
      .mockResolvedValueOnce({ finalOutput: "The artifact is accurate enough to show." } as Awaited<ReturnType<typeof run>>);

    const response = await handleAgentRoute({
      mode: "chat",
      message: "Help me understand elastic potential energy",
      messages: [{ id: "m1", role: "user", content: "I learn best by experimenting.", createdAt: "2026-06-10T00:00:00.000Z" }],
    });

    expect(mockedRun).toHaveBeenCalledTimes(3);
    expect(mockedRun.mock.calls[0]?.[1]).toContain("Mode: chat");
    expect(parseBuilderLessonPlan(mockedRun.mock.calls[1]?.[1])).toMatchObject({
      artifactNeeded: true,
      lessonMode: "playground",
      title: "Elastic Potential Energy Playground",
      topic: "elastic potential energy",
      interactionGoal: "Change displacement and watch stored energy update.",
      mechanismSpec: expect.objectContaining({ topic: "elastic potential energy" }),
      builderBrief: "Build a spring-mass playground with a displacement slider and energy bar.",
    });
    expect(mockedRun.mock.calls[1]?.[1]).toContain("Original user request");
    expect(mockedRun.mock.calls[2]?.[1]).toContain("Artifact to review");
    expect(mockedRun.mock.calls[2]?.[1]).toContain("Elastic Potential Energy Playground");
    expect(response.artifact?.lessonMode).toBe("playground");
    expect(response.trace).toEqual(expect.arrayContaining([
      expect.stringContaining("lesson mode"),
      expect.stringContaining("playground"),
      expect.stringContaining("artifact"),
      expect.stringContaining("Validating artifact contract"),
      expect.stringContaining("Reviewing artifact accuracy"),
    ]));
  });

  it("retries once with critic feedback when the first artifact is not accurate enough", async () => {
    const firstArtifact = {
      ...artifact,
      id: "artifact-bad",
      title: "Jet Engine Cutaway",
      topic: "jet engines",
      summary: "A first attempt with a missing shaft.",
    };
    const repairedArtifact = {
      ...artifact,
      id: "artifact-repaired",
      title: "Jet Engine Cutaway",
      topic: "jet engines",
      summary: "A repaired cutaway with shaft power transfer.",
    };
    lessonPlanState.result = {
      ok: true,
      plan: {
        artifactNeeded: true,
        lessonMode: "guided_walkthrough",
        title: "Jet Engine Cutaway",
        topic: "jet engines",
        rationale: "A guided cutaway can show the flow and power stages.",
        interactionGoal: "Trace airflow and shaft power through the engine.",
        researchUsed: true,
        sources: [{ title: "Jet Engines", url: "https://example.com/jet-engines", summary: "Turbines drive compressors through a shaft." }],
        requiredComponents: ["fan", "compressor", "combustor", "turbine", "shaft", "nozzle"],
        mechanismSpec: {
          ...mechanismSpec,
          topic: "jet engines",
          sourceClaims: [{ claim: "The turbine powers the compressor through a central shaft.", sourceUrl: "https://example.com/jet-engines" }],
        },
        builderBrief: "Build a guided jet-engine cutaway.",
      },
    };
    createExperienceState.results = [
      { ok: true, artifact: firstArtifact },
      { ok: true, artifact: repairedArtifact },
    ];
    artifactCritiqueState.results = [
      {
        approved: false,
        factualIssues: ["The turbine appears disconnected from the compressor."],
        visualIssues: [],
        interactionIssues: ["The walkthrough does not explain shaft power transfer."],
        missingComponents: ["shaft"],
        repairInstructions: "Add a central shaft and a walkthrough step showing turbine-to-shaft-to-compressor power transfer.",
      },
      approvedCritique,
    ];
    mockedRun
      .mockResolvedValueOnce({ finalOutput: "Plan ready." } as Awaited<ReturnType<typeof run>>)
      .mockResolvedValueOnce({ finalOutput: "I built the first cutaway." } as Awaited<ReturnType<typeof run>>)
      .mockResolvedValueOnce({ finalOutput: "This needs repair." } as Awaited<ReturnType<typeof run>>)
      .mockResolvedValueOnce({ finalOutput: "I repaired the cutaway." } as Awaited<ReturnType<typeof run>>)
      .mockResolvedValueOnce({ finalOutput: "The repaired cutaway is accurate enough to show." } as Awaited<ReturnType<typeof run>>);

    const response = await handleAgentRoute({
      mode: "chat",
      message: "Build a jet engine cutaway",
      messages: [],
    });

    expect(mockedRun).toHaveBeenCalledTimes(5);
    expect(createExperienceState.clearCount).toBe(1);
    expect(mockedRun.mock.calls[3]?.[1]).toContain("Critic feedback from previous attempt");
    expect(mockedRun.mock.calls[3]?.[1]).toContain("central shaft");
    expect(response).toMatchObject({
      message: "I repaired the cutaway.",
      artifact: { id: "artifact-repaired" },
      error: null,
    });
    expect(response.trace).toEqual(expect.arrayContaining([
      "Reviewing artifact accuracy",
      "Repairing artifact from critic feedback",
      "Re-reviewing artifact accuracy",
    ]));
  });

  it("blocks the artifact when the critic still rejects the single repair attempt", async () => {
    lessonPlanState.result = {
      ok: true,
      plan: {
        artifactNeeded: true,
        lessonMode: "guided_walkthrough",
        title: "Jet Engine Cutaway",
        topic: "jet engines",
        rationale: "A guided cutaway can show the flow and power stages.",
        interactionGoal: "Trace airflow and shaft power through the engine.",
        researchUsed: true,
        sources: [{ title: "Jet Engines", url: "https://example.com/jet-engines", summary: "Turbines drive compressors through a shaft." }],
        requiredComponents: ["fan", "compressor", "combustor", "turbine", "shaft", "nozzle"],
        mechanismSpec: {
          ...mechanismSpec,
          topic: "jet engines",
          sourceClaims: [{ claim: "The turbine powers the compressor through a central shaft.", sourceUrl: "https://example.com/jet-engines" }],
        },
        builderBrief: "Build a guided jet-engine cutaway.",
      },
    };
    createExperienceState.results = [
      { ok: true, artifact },
      { ok: true, artifact: replacementArtifact },
    ];
    artifactCritiqueState.results = [
      {
        approved: false,
        factualIssues: ["The shaft is missing."],
        visualIssues: [],
        interactionIssues: [],
        missingComponents: ["shaft"],
        repairInstructions: "Add the central shaft.",
      },
      {
        approved: false,
        factualIssues: ["The shaft is present but not connected to the turbine."],
        visualIssues: [],
        interactionIssues: ["The walkthrough still implies direct fan drive."],
        missingComponents: [],
        repairInstructions: "Connect the shaft to the turbine and compressor before showing the room.",
      },
    ];
    mockedRun
      .mockResolvedValueOnce({ finalOutput: "Plan ready." } as Awaited<ReturnType<typeof run>>)
      .mockResolvedValueOnce({ finalOutput: "I built the first cutaway." } as Awaited<ReturnType<typeof run>>)
      .mockResolvedValueOnce({ finalOutput: "This needs repair." } as Awaited<ReturnType<typeof run>>)
      .mockResolvedValueOnce({ finalOutput: "I repaired the cutaway." } as Awaited<ReturnType<typeof run>>)
      .mockResolvedValueOnce({ finalOutput: "This still needs repair." } as Awaited<ReturnType<typeof run>>);

    const response = await handleAgentRoute({
      mode: "chat",
      message: "Build a jet engine cutaway",
      messages: [],
    });

    expect(response).toEqual({
      message: expect.stringContaining("couldn't generate a reliable artifact"),
      trace: expect.arrayContaining([
        "Reviewing artifact accuracy",
        "Repairing artifact from critic feedback",
        "Re-reviewing artifact accuracy",
      ]),
      artifact: null,
      error: expect.stringContaining("shaft is present but not connected"),
    });
  });

  it("retries once when static artifact validation rejects the first build", async () => {
    lessonPlanState.result = {
      ok: true,
      plan: {
        artifactNeeded: true,
        lessonMode: "guided_walkthrough",
        title: "Aerobic Respiration: From Glucose to ATP",
        topic: "aerobic respiration",
        rationale: "A guided walkthrough fits the sequence of respiration stages.",
        interactionGoal: "Follow glucose breakdown through ATP production.",
        researchUsed: false,
        sources: [],
        requiredComponents: ["glucose", "oxygen", "mitochondrion"],
        mechanismSpec,
        builderBrief: "Build a guided respiration walkthrough with no playground controls.",
      },
    };
    createExperienceState.results = [
      { ok: false, error: "Guided walkthrough artifacts must not declare controls." },
      { ok: true, artifact: replacementArtifact },
    ];
    mockedRun
      .mockResolvedValueOnce({ finalOutput: "Plan ready." } as Awaited<ReturnType<typeof run>>)
      .mockResolvedValueOnce({ finalOutput: "I built the first respiration room." } as Awaited<ReturnType<typeof run>>)
      .mockResolvedValueOnce({ finalOutput: "I repaired the respiration room." } as Awaited<ReturnType<typeof run>>)
      .mockResolvedValueOnce({ finalOutput: "The repaired room is accurate enough to show." } as Awaited<ReturnType<typeof run>>);

    const response = await handleAgentRoute({
      mode: "chat",
      message: "Give me an interactive experience to learn this concept",
      messages: [],
    });

    expect(mockedRun).toHaveBeenCalledTimes(4);
    expect(createExperienceState.clearCount).toBe(1);
    expect(mockedRun.mock.calls[2]?.[1]).toContain("Validator feedback from previous attempt");
    expect(mockedRun.mock.calls[2]?.[1]).toContain("Guided walkthrough artifacts must not declare controls.");
    expect(response).toMatchObject({
      message: "I repaired the respiration room.",
      artifact: { id: replacementArtifact.id },
      error: null,
    });
    expect(response.trace).toEqual(expect.arrayContaining([
      "Repairing artifact from validator feedback",
      "Reviewing artifact accuracy",
    ]));
  });

  it("retries once when the builder skips create_experience", async () => {
    lessonPlanState.result = {
      ok: true,
      plan: {
        artifactNeeded: true,
        lessonMode: "guided_walkthrough",
        title: "Aerobic Respiration: From Glucose to ATP",
        topic: "aerobic respiration",
        rationale: "A guided walkthrough fits the sequence of respiration stages.",
        interactionGoal: "Follow glucose breakdown through ATP production.",
        researchUsed: false,
        sources: [],
        requiredComponents: ["glucose", "oxygen", "mitochondrion"],
        mechanismSpec,
        builderBrief: "Build a guided respiration walkthrough.",
      },
    };
    createExperienceState.results = [
      null,
      { ok: true, artifact: replacementArtifact },
    ];
    mockedRun
      .mockResolvedValueOnce({ finalOutput: "Plan ready." } as Awaited<ReturnType<typeof run>>)
      .mockResolvedValueOnce({ finalOutput: "I forgot to call the tool." } as Awaited<ReturnType<typeof run>>)
      .mockResolvedValueOnce({ finalOutput: "I built it with the tool this time." } as Awaited<ReturnType<typeof run>>)
      .mockResolvedValueOnce({ finalOutput: "The artifact is accurate enough to show." } as Awaited<ReturnType<typeof run>>);

    const response = await handleAgentRoute({
      mode: "chat",
      message: "Give me an interactive experience to learn this concept",
      messages: [],
    });

    expect(mockedRun).toHaveBeenCalledTimes(4);
    expect(mockedRun.mock.calls[2]?.[1]).toContain("The builder did not call create_experience");
    expect(response).toMatchObject({
      message: "I built it with the tool this time.",
      artifact: { id: replacementArtifact.id },
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
    expect(parseTutorContext(mockedRun.mock.calls[0]?.[1])).toMatchObject({
      mode: "learning_room",
      artifact: {
        lessonMode: "guided_walkthrough",
        interactionGoal: "Trace how the cell membrane and nucleus organize the cell.",
        controls: [
          expect.objectContaining({ id: "labels", label: "Labels" }),
        ],
        sources: [
          expect.objectContaining({ title: "Cell Basics", url: "https://example.com/cells" }),
        ],
      },
      selectedComponent: { artifactId: artifact.id, id: "nucleus", label: "Nucleus" },
      activeStep: expect.objectContaining({ id: "intro", title: "Start" }),
    });
  });

  it("passes playground artifact lesson metadata into the tutor prompt", async () => {
    mockedRun.mockResolvedValueOnce({ finalOutput: "Try moving the mass farther and watch the stored energy rise." } as Awaited<ReturnType<typeof run>>);

    await handleAgentRoute({
      mode: "learning_room",
      message: "What should I try next?",
      artifact: {
        ...artifact,
        id: "artifact-2",
        title: "Elastic Potential Energy Playground",
        topic: "elastic potential energy",
        summary: "Manipulate displacement to see how spring energy changes.",
        lessonMode: "playground",
        interactionGoal: "Change displacement and watch stored energy update.",
        sources: [],
        controls: [
          {
            id: "displacement",
            type: "range",
            label: "Displacement",
            min: -2,
            max: 2,
            step: 0.1,
            value: 1,
          },
        ],
        walkthroughSteps: [],
      },
      messages: [],
      selectedComponent: null,
      activeStepId: null,
    });

    expect(parseTutorContext(mockedRun.mock.calls[0]?.[1])).toMatchObject({
      mode: "learning_room",
      artifact: {
        lessonMode: "playground",
        controls: [
          expect.objectContaining({ id: "displacement", label: "Displacement" }),
        ],
      },
      selectedComponent: null,
      activeStep: null,
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
    lessonPlanState.result = {
      ok: true,
      plan: {
        artifactNeeded: true,
        lessonMode: "guided_walkthrough",
        title: artifact.title,
        topic: artifact.topic,
        rationale: "A guided walkthrough fits a systems overview.",
        interactionGoal: artifact.interactionGoal,
        researchUsed: false,
        sources: artifact.sources ?? [],
        requiredComponents: ["membrane", "nucleus", "ribosome"],
        builderBrief: "Build a guided cell room.",
      },
    };
    createExperienceState.result = { ok: true, artifact };
    mockedRun
      .mockResolvedValueOnce({ finalOutput: "Plan ready." } as Awaited<ReturnType<typeof run>>)
      .mockResolvedValueOnce({ finalOutput: "I built a guided cell room." } as Awaited<ReturnType<typeof run>>);

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

  it("persists threaded artifact build failures as user and assistant messages without saving artifacts", async () => {
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
    lessonPlanState.result = {
      ok: true,
      plan: {
        artifactNeeded: true,
        lessonMode: "guided_walkthrough",
        title: artifact.title,
        topic: artifact.topic,
        rationale: "A guided walkthrough fits a systems overview.",
        interactionGoal: artifact.interactionGoal,
        researchUsed: false,
        sources: artifact.sources ?? [],
        requiredComponents: ["membrane", "nucleus", "ribosome"],
        builderBrief: "Build a guided cell room.",
      },
    };
    createExperienceState.results = [
      {
        ok: false,
        error: "Artifact validation failed: missing registerComponent call.",
      },
      {
        ok: false,
        error: "Artifact validation failed: missing registerComponent call.",
      },
    ];
    mockedRun
      .mockResolvedValueOnce({ finalOutput: "Plan ready." } as Awaited<ReturnType<typeof run>>)
      .mockResolvedValueOnce({ finalOutput: "Builder attempted the artifact." } as Awaited<ReturnType<typeof run>>)
      .mockResolvedValueOnce({ finalOutput: "Builder attempted a repair." } as Awaited<ReturnType<typeof run>>);

    const response = await handleAgentRoute({
      mode: "chat",
      threadId: "thread-1",
      userId: "demo-1",
      message: "Build a cell room",
      messages: [],
    });

    expect(response).toEqual({
      message: "Artifact validation failed: missing registerComponent call.",
      trace: expect.arrayContaining([
        expect.stringContaining("lesson mode"),
        expect.stringContaining("artifact"),
        "Repairing artifact from validator feedback",
      ]),
      artifact: null,
      error: "Artifact validation failed: missing registerComponent call.",
    });
    expect(appendMessage).toHaveBeenCalledTimes(2);
    expect(appendMessage.mock.calls[0][2]).toMatchObject({ role: "user", content: "Build a cell room" });
    expect(appendMessage.mock.calls[1][2]).toMatchObject({
      role: "assistant",
      content: "Artifact validation failed: missing registerComponent call.",
    });
    expect(saveArtifact).not.toHaveBeenCalled();
  });

  it("treats planned artifacts with no create_experience result as build failures", async () => {
    lessonPlanState.result = {
      ok: true,
      plan: {
        artifactNeeded: true,
        lessonMode: "guided_walkthrough",
        title: artifact.title,
        topic: artifact.topic,
        rationale: "A guided walkthrough fits a systems overview.",
        interactionGoal: artifact.interactionGoal,
        researchUsed: false,
        sources: artifact.sources ?? [],
        requiredComponents: ["membrane", "nucleus", "ribosome"],
        builderBrief: "Build a guided cell room.",
      },
    };
    createExperienceState.result = null;
    mockedRun
      .mockResolvedValueOnce({ finalOutput: "Plan ready." } as Awaited<ReturnType<typeof run>>)
      .mockResolvedValueOnce({ finalOutput: "I built a guided cell room." } as Awaited<ReturnType<typeof run>>);

    const response = await handleAgentRoute({
      mode: "chat",
      message: "Build a cell room",
      messages: [],
    });

    expect(response.artifact).toBeNull();
    expect(response.error).toMatch(/did not call create_experience/i);
    expect(response.message).toMatch(/did not call create_experience/i);
  });

  it("persists missing create_experience results as threaded user and assistant error messages without saving artifacts", async () => {
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
    lessonPlanState.result = {
      ok: true,
      plan: {
        artifactNeeded: true,
        lessonMode: "guided_walkthrough",
        title: artifact.title,
        topic: artifact.topic,
        rationale: "A guided walkthrough fits a systems overview.",
        interactionGoal: artifact.interactionGoal,
        researchUsed: false,
        sources: artifact.sources ?? [],
        requiredComponents: ["membrane", "nucleus", "ribosome"],
        builderBrief: "Build a guided cell room.",
      },
    };
    createExperienceState.result = null;
    mockedRun
      .mockResolvedValueOnce({ finalOutput: "Plan ready." } as Awaited<ReturnType<typeof run>>)
      .mockResolvedValueOnce({ finalOutput: "I built a guided cell room." } as Awaited<ReturnType<typeof run>>);

    const response = await handleAgentRoute({
      mode: "chat",
      threadId: "thread-1",
      userId: "demo-1",
      message: "Build a cell room",
      messages: [],
    });

    expect(response.artifact).toBeNull();
    expect(response.error).toMatch(/did not call create_experience/i);
    expect(appendMessage).toHaveBeenCalledTimes(2);
    expect(appendMessage.mock.calls[0][2]).toMatchObject({ role: "user", content: "Build a cell room" });
    expect(appendMessage.mock.calls[1][2]).toMatchObject({
      role: "assistant",
      content: expect.stringMatching(/did not call create_experience/i),
    });
    expect(saveArtifact).not.toHaveBeenCalled();
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
    lessonPlanState.result = {
      ok: true,
      plan: {
        artifactNeeded: true,
        lessonMode: "guided_walkthrough",
        title: artifact.title,
        topic: artifact.topic,
        rationale: "A guided walkthrough fits a systems overview.",
        interactionGoal: artifact.interactionGoal,
        researchUsed: false,
        sources: artifact.sources ?? [],
        requiredComponents: ["membrane", "nucleus", "ribosome"],
        builderBrief: "Build a guided cell room.",
      },
    };
    createExperienceState.result = { ok: true, artifact };
    mockedRun
      .mockResolvedValueOnce({ finalOutput: "Plan ready." } as Awaited<ReturnType<typeof run>>)
      .mockResolvedValueOnce({ finalOutput: "I built a guided cell room." } as Awaited<ReturnType<typeof run>>);

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

  it("rejects partial threaded context during route parsing", async () => {
    await expect(handleAgentRoute({
      mode: "chat",
      threadId: "thread-1",
      message: "Teach me turbines",
      messages: [],
    })).rejects.toThrow(/userId/i);

    await expect(handleAgentRoute({
      mode: "chat",
      userId: "demo-1",
      message: "Teach me turbines",
      messages: [],
    })).rejects.toThrow(/threadId/i);
  });

  it("lets learning-room requests create and persist a replacement artifact", async () => {
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
    createExperienceState.result = { ok: true, artifact: replacementArtifact };
    mockedRun.mockResolvedValueOnce({ finalOutput: "I rebuilt the room with corrected geometry." } as Awaited<ReturnType<typeof run>>);

    const response = await handleAgentRoute({
      mode: "learning_room",
      threadId: "thread-1",
      userId: "demo-1",
      message: "Rebuild the scene with corrected cylinder geometry",
      artifact,
      messages: [],
      selectedComponent: null,
      activeStepId: "intro",
    });

    expect(response).toEqual({
      message: "I rebuilt the room with corrected geometry.",
      trace: ["Planning replacement scene", "Generating replacement 3D artifact", "Validating artifact contract"],
      artifact: replacementArtifact,
      commands: [],
      error: null,
    });
    expect(saveArtifact).toHaveBeenCalledWith("demo-1", "thread-1", replacementArtifact);
    expect(appendMessage).toHaveBeenCalledTimes(2);
    expect(appendMessage.mock.calls[0][2]).toMatchObject({
      role: "user",
      content: "Rebuild the scene with corrected cylinder geometry",
      artifactId: artifact.id,
    });
    expect(appendMessage.mock.calls[1][2]).toMatchObject({
      role: "assistant",
      content: "I rebuilt the room with corrected geometry.",
      artifactId: replacementArtifact.id,
    });
  });

  it("includes active scene source in the learning-room prompt for patch requests", async () => {
    mockedRun.mockResolvedValueOnce({ finalOutput: "I can patch that." } as Awaited<ReturnType<typeof run>>);

    await handleAgentRoute({
      mode: "learning_room",
      message: "Patch the scene source to fix the cylinder constructor",
      artifact,
      messages: [],
      selectedComponent: null,
      activeStepId: "intro",
    });

    const prompt = mockedRun.mock.calls[0]?.[1] as string;
    expect(prompt).toContain('"sceneSource"');
    expect(prompt).toContain(artifact.sceneSource);
  });

  it("includes the latest artifact context in chat prompts for rebuild follow-ups", async () => {
    mockedRun.mockResolvedValueOnce({ finalOutput: "I can rebuild that." } as Awaited<ReturnType<typeof run>>);

    await handleAgentRoute({
      mode: "chat",
      message: "Rebuild it with the corrected cylinder geometry",
      messages: [
        {
          id: "message-1",
          role: "assistant",
          content: "I built a cell room.",
          artifactId: artifact.id,
          createdAt: "2026-06-09T13:01:00.000Z",
        },
      ],
      artifacts: { [artifact.id]: artifact },
      lastArtifactId: artifact.id,
    });

    const prompt = mockedRun.mock.calls[0]?.[1] as string;
    expect(prompt).toContain("Latest artifact context");
    expect(prompt).toContain(artifact.title);
    expect(prompt).toContain(artifact.sceneSource);
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

  it("streams planner-first chat without running the builder when no artifact is needed", async () => {
    mockedRun.mockResolvedValueOnce({ finalOutput: "Let us reason through the cell membrane together." } as Awaited<ReturnType<typeof run>>);

    const response = handleAgentRouteStream({ mode: "chat", message: "Teach me cells", messages: [] });
    const events = decodeAgentStreamEvents(await new Response(response).text());

    expect(mockedRun).toHaveBeenCalledTimes(1);
    expect(mockedRun).toHaveBeenCalledWith(expect.anything(), expect.any(String), {
      maxTurns: 6,
      signal: expect.any(AbortSignal),
    });
    expect(events).toEqual([
      { type: "status", message: "Thinking..." },
      {
        type: "done",
        message: "Let us reason through the cell membrane together.",
        trace: [],
        artifact: null,
        commands: [],
        error: null,
      },
    ]);
  });

  it("streams the builder only after the planner decides an artifact is needed", async () => {
    lessonPlanState.result = {
      ok: true,
      plan: {
        artifactNeeded: true,
        lessonMode: "playground",
        title: "Elastic Potential Energy Playground",
        topic: "elastic potential energy",
        rationale: "A slider-driven playground makes the relationship concrete.",
        interactionGoal: "Move the mass and relate displacement to stored energy.",
        researchUsed: false,
        sources: [],
        requiredComponents: ["spring", "mass", "energy bar"],
        builderBrief: "Build a spring-mass playground.",
      },
    };
    createExperienceState.result = {
      ok: true,
      artifact: {
        ...artifact,
        lessonMode: "playground",
        title: "Elastic Potential Energy Playground",
        topic: "elastic potential energy",
        walkthroughSteps: [],
      },
    };
    mockedRun
      .mockResolvedValueOnce({ finalOutput: "Planning complete." } as Awaited<ReturnType<typeof run>>)
      .mockResolvedValueOnce({
        finalOutput: "Now explore the spring-energy playground.",
        completed: Promise.resolve(),
        error: null,
        toTextStream: () =>
          new ReadableStream<string>({
            start(controller) {
              controller.enqueue("Now explore ");
              controller.enqueue("the spring-energy playground.");
              controller.close();
            },
          }),
      } as never);

    const response = handleAgentRouteStream({ mode: "chat", message: "Help me understand elastic potential energy", messages: [] });
    const events = decodeAgentStreamEvents(await new Response(response).text());

    expect(mockedRun).toHaveBeenCalledTimes(3);
    expect(mockedRun.mock.calls[0]?.[2]).toEqual({ maxTurns: 6, signal: expect.any(AbortSignal) });
    expect(mockedRun.mock.calls[1]?.[2]).toEqual({
      maxTurns: 8,
      stream: true,
      signal: expect.any(AbortSignal),
    });
    expect(mockedRun.mock.calls[2]?.[2]).toEqual({ maxTurns: 4 });
    expect(events).toEqual([
      { type: "status", message: "Thinking..." },
      { type: "status", message: "Selected playground mode..." },
      { type: "status", message: "Building the interactive artifact..." },
      { type: "delta", delta: "Now explore " },
      { type: "delta", delta: "the spring-energy playground." },
      {
        type: "done",
        message: "Now explore the spring-energy playground.",
        trace: expect.arrayContaining([
          expect.stringContaining("lesson mode"),
          expect.stringContaining("artifact"),
        ]),
        artifact: expect.objectContaining({ lessonMode: "playground" }),
        commands: [],
        error: null,
      },
    ]);
  });

  it("streams safe reasoning and tool execution trace events from the agent run", async () => {
    createExperienceState.result = { ok: true, artifact: replacementArtifact };
    const streamResult = {
      finalOutput: "I built a corrected room.",
      completed: Promise.resolve(),
      error: null,
      async *[Symbol.asyncIterator]() {
        yield { type: "agent_updated_stream_event", agent: { name: "Parallax Agent" } };
        yield {
          type: "run_item_stream_event",
          name: "reasoning_item_created",
          item: {
            type: "reasoning_item",
            rawItem: {
              type: "reasoning",
              rawContent: [{ type: "reasoning_text", text: "private chain of thought should not leak" }],
            },
          },
        };
        yield {
          type: "run_item_stream_event",
          name: "tool_called",
          item: {
            type: "tool_call_item",
            toolName: "create_experience",
            rawItem: { type: "function_call", name: "create_experience", arguments: "{\"sceneSource\":\"very large source\"}" },
          },
        };
        yield {
          type: "run_item_stream_event",
          name: "tool_output",
          item: {
            type: "tool_call_output_item",
            rawItem: { type: "function_call_result", name: "create_experience", output: "{\"ok\":true,\"componentCount\":3}" },
            output: { ok: true, componentCount: 3 },
          },
        };
        yield {
          type: "raw_model_stream_event",
          data: {
            event: {
              type: "response.function_call_arguments.delta",
              delta: "{\"sceneSource\":\"tool arguments should not stream as assistant text\"}",
            },
          },
        };
        yield { type: "raw_model_stream_event", data: { event: { type: "response.output_text.delta", delta: "I built " } } };
        yield { type: "raw_model_stream_event", data: { event: { type: "response.output_text.delta", delta: "a corrected room." } } };
      },
    };
    mockedRun.mockResolvedValueOnce(streamResult as never);

    const response = handleAgentRouteStream({
      mode: "learning_room",
      message: "Fix this scene",
      artifact,
      messages: [],
      selectedComponent: null,
      activeStepId: "intro",
    });
    const events = decodeAgentStreamEvents(await new Response(response).text());

    expect(events).toEqual([
      { type: "status", message: "Thinking..." },
      { type: "trace", entry: { kind: "agent", label: "Using Parallax Agent" } },
      { type: "trace", entry: { kind: "reasoning", label: "Reasoning through next step" } },
      { type: "trace", entry: { kind: "tool", label: "Calling create_experience", detail: "Executing tool" } },
      { type: "trace", entry: { kind: "tool", label: "create_experience completed", detail: "Succeeded (3 components)" } },
      { type: "delta", delta: "I built " },
      { type: "delta", delta: "a corrected room." },
      {
        type: "done",
        message: "I built a corrected room.",
        trace: ["Planning replacement scene", "Generating replacement 3D artifact", "Validating artifact contract"],
        artifact: replacementArtifact,
        commands: [],
        error: null,
      },
    ]);
    expect(JSON.stringify(events)).not.toContain("private chain of thought");
    expect(JSON.stringify(events)).not.toContain("very large source");
    expect(JSON.stringify(events)).not.toContain("tool arguments should not stream as assistant text");
  });

  it("streams a done event with an error instead of crashing the stream", async () => {
    mockedRun.mockRejectedValueOnce(new Error("Model unavailable"));

    const response = handleAgentRouteStream({ mode: "chat", message: "Teach me cells", messages: [] });
    const events = decodeAgentStreamEvents(await new Response(response).text());

    expect(events).toEqual([
      { type: "status", message: "Thinking..." },
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

  it("streams learning-room deltas and preserves emitted commands in the done event", async () => {
    artifactCommandState.commands = [
      { type: "focus_component", componentId: "nucleus" },
      { type: "go_to_step", stepId: "intro" },
    ];
    mockedRun.mockResolvedValueOnce({
      finalOutput: "Let’s focus on the nucleus first.",
      completed: Promise.resolve(),
      error: null,
      toTextStream: () =>
        new ReadableStream<string>({
          start(controller) {
            controller.enqueue("Let’s focus ");
            controller.enqueue("on the nucleus first.");
            controller.close();
          },
        }),
    } as never);

    const response = handleAgentRouteStream({
      mode: "learning_room",
      message: "Show me the nucleus",
      artifact,
      messages: [],
      selectedComponent: null,
      activeStepId: "intro",
    });
    const events = decodeAgentStreamEvents(await new Response(response).text());

    expect(mockedRun).toHaveBeenCalledTimes(1);
    expect(mockedRun).toHaveBeenCalledWith(expect.anything(), expect.any(String), {
      maxTurns: 6,
      stream: true,
      signal: expect.any(AbortSignal),
    });
    expect(events).toEqual([
      { type: "status", message: "Thinking..." },
      { type: "delta", delta: "Let’s focus " },
      { type: "delta", delta: "on the nucleus first." },
      {
        type: "done",
        message: "Let’s focus on the nucleus first.",
        trace: [],
        artifact: null,
        commands: [
          { type: "focus_component", componentId: "nucleus" },
          { type: "go_to_step", stepId: "intro" },
        ],
        error: null,
      },
    ]);
  });

  it("passes a combined abort signal to streaming runs and aborts it when the response stream is canceled", async () => {
    let textController: ReadableStreamDefaultController<string> | null = null;
    lessonPlanState.result = {
      ok: true,
      plan: {
        artifactNeeded: true,
        lessonMode: "playground",
        title: "Elastic Potential Energy Playground",
        topic: "elastic potential energy",
        rationale: "A playground lets the learner manipulate the core variable.",
        interactionGoal: "Change displacement and inspect the energy response.",
        researchUsed: false,
        sources: [],
        requiredComponents: ["spring", "mass", "energy bar"],
        builderBrief: "Build a spring-mass playground.",
      },
    };
    mockedRun.mockImplementationOnce(async (_agent, _prompt, options) => {
      expect(options).toEqual({ maxTurns: 6, signal: expect.any(AbortSignal) });
      return { finalOutput: "Planning complete." } as never;
    });
    mockedRun.mockImplementationOnce(async (_agent, _prompt, options) => {
      options?.signal?.addEventListener("abort", () => textController?.close(), { once: true });
      return {
        finalOutput: undefined,
        completed: new Promise<void>((resolve) => {
          options?.signal?.addEventListener("abort", () => resolve(), { once: true });
        }),
        error: null,
        toTextStream: () =>
          new ReadableStream<string>({
            start(controller) {
              textController = controller;
            },
          }),
      } as never;
    });

    const requestAbort = new AbortController();
    const response = handleAgentRouteStream(
      { mode: "chat", message: "Teach me cells", messages: [] },
      { signal: requestAbort.signal },
    );
    const reader = response.getReader();

    await reader.read();
    for (let attempt = 0; attempt < 50 && mockedRun.mock.calls.length < 2; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(mockedRun.mock.calls[1]).toEqual([expect.anything(), expect.any(String), {
      maxTurns: 8,
      stream: true,
      signal: expect.any(AbortSignal),
    }]);
    const runSignal = mockedRun.mock.calls[1]?.[2]?.signal;

    expect(runSignal?.aborted).toBe(false);
    await reader.cancel();
    expect(runSignal?.aborted).toBe(true);
  });
});
