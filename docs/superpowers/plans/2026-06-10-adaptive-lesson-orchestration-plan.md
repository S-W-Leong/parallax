# Adaptive Lesson Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a demo-ready Planner -> Builder -> Tutor flow where the Planner chooses the lesson mode, optionally uses Exa for grounding, and the Builder generates an artifact that adapts its UI to the chosen pedagogy.

**Architecture:** Chat mode becomes a two-stage orchestration. A Planner agent can call `research_stem_topic`, then must call a structured `choose_lesson_plan` tool when an artifact is needed. A Builder agent receives that plan and calls `create_experience`, whose schema now includes `lessonMode`, optional sources, optional controls, and lesson-mode-specific validation. The artifact runtime shows walkthrough chrome only for guided lessons and exposes a safe `registerControl` API for playground lessons.

**Tech Stack:** Next.js App Router, TypeScript strict mode, OpenAI Agents SDK tool sinks, Zod boundary schemas, Vitest unit tests, Three.js artifact iframe runtime.

---

## Demo Scope

Implement only these lesson modes:

- `playground`: for parameter-driven concepts like elastic potential energy. It should hide walkthrough controls and expose at least one runtime-owned control such as a range slider.
- `guided_walkthrough`: for ordered systems or processes like jet engines. It keeps the existing walkthrough behavior.

Do not implement `comparison_lab`, `exploded_system`, or `process_sequence` yet. The Planner prompt can mention that future modes exist, but the schema must reject them until the runtime supports them.

## File Structure

- Modify `lib/artifacts/artifactTypes.ts`: add `lessonMode`, `interactionGoal`, `sources`, `controls`, and make `walkthroughSteps` mode-aware at validation time.
- Modify `lib/cloud/threadRecords.ts`: persist new artifact metadata fields.
- Modify `lib/artifacts/artifactValidator.ts`: enforce mode-specific constraints before HTML rendering.
- Modify `lib/artifacts/artifactTemplate.ts`: add adaptive walkthrough chrome and `registerControl`.
- Modify `lib/agent/prompts.ts`: split planner, builder, and tutor instructions.
- Modify `lib/agent/agents.ts`: expose named agent factories.
- Create `lib/agent/tools/lessonPlanTool.ts`: structured Planner tool sink.
- Modify `lib/agent/tools/createExperienceTool.ts`: normalize new fields.
- Modify `lib/agent/routes.ts`: run Planner first, then Builder when a lesson plan exists.
- Modify tests in `tests/artifact-validator.test.ts`, `tests/artifact-template.test.ts`, `tests/agent-tools.test.ts`, `tests/agent-routes.test.ts`, `tests/thread-records.test.ts`, and `tests/thread-session.test.ts`.

---

### Task 1: Extend Artifact Data Contract

**Files:**
- Modify: `lib/artifacts/artifactTypes.ts`
- Modify: `lib/cloud/threadRecords.ts`
- Test: `tests/artifact-validator.test.ts`
- Test: `tests/thread-records.test.ts`
- Test: `tests/thread-session.test.ts`

- [ ] **Step 1: Write failing type and persistence tests**

Add a playground artifact test in `tests/artifact-validator.test.ts`:

```ts
it("creates a playground artifact with controls and no walkthrough steps", () => {
  const result = createArtifactRecord({
    lessonMode: "playground",
    topic: "elastic potential energy",
    title: "Elastic Potential Energy Playground",
    summary: "Adjust displacement and watch stored energy change.",
    interactionGoal: "Change displacement and connect spring deformation to U = 1/2kx^2.",
    sceneSource: `
const spring = new THREE.Group();
const mass = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
const bar = new THREE.Mesh(new THREE.BoxGeometry(.2, 1, 1), new THREE.MeshStandardMaterial());
root.add(spring, mass, bar);
registerComponent("spring", "Spring", spring, {});
registerComponent("mass", "Mass", mass, {});
registerComponent("energy-bar", "Energy Bar", bar, {});
registerControl({ id: "displacement", type: "range", label: "Displacement", min: -2, max: 2, step: 0.1, value: 1 }, function(value) { mass.position.x = value; });
setWalkthroughSteps([]);
`,
    components: [
      { id: "spring", label: "Spring" },
      { id: "mass", label: "Mass" },
      { id: "energy-bar", label: "Energy Bar" },
    ],
    controls: [
      { id: "displacement", type: "range", label: "Displacement", min: -2, max: 2, step: 0.1, value: 1 },
    ],
    walkthroughSteps: [],
  });

  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.artifact.lessonMode).toBe("playground");
    expect(result.artifact.walkthroughSteps).toEqual([]);
    expect(result.artifact.controls?.[0]?.id).toBe("displacement");
  }
});
```

Add persistence coverage in `tests/thread-records.test.ts`:

```ts
it("allows artifact metadata records to carry lesson mode and controls", () => {
  const record: ArtifactMetadataRecord = {
    PK: "THREAD#thread-1",
    SK: "ARTIFACT#artifact-1",
    entityType: "artifact",
    threadId: "thread-1",
    artifactId: "artifact-1",
    title: "Elastic Energy Playground",
    topic: "elastic potential energy",
    summary: "Adjust displacement.",
    htmlS3Key: "artifacts/thread-1/artifact-1/index.html",
    sceneSourceS3Key: "artifacts/thread-1/artifact-1/scene.js",
    lessonMode: "playground",
    interactionGoal: "Use a slider to connect displacement to stored energy.",
    controls: [{ id: "displacement", type: "range", label: "Displacement", min: -2, max: 2, step: 0.1, value: 1 }],
    components: [
      { id: "spring", label: "Spring" },
      { id: "mass", label: "Mass" },
      { id: "energy-bar", label: "Energy Bar" },
    ],
    walkthroughSteps: [],
    createdAt: "2026-06-10T00:00:00.000Z",
  };

  expect(record.lessonMode).toBe("playground");
  expect(record.controls?.[0]?.id).toBe("displacement");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run tests/artifact-validator.test.ts tests/thread-records.test.ts
```

Expected: FAIL because `lessonMode`, `interactionGoal`, and `controls` are not in the artifact schemas yet.

- [ ] **Step 3: Implement artifact schemas**

In `lib/artifacts/artifactTypes.ts`, add schemas near the existing artifact schemas:

```ts
export const lessonModeSchema = z.enum(["playground", "guided_walkthrough"]);

export const artifactSourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  summary: z.string().min(1),
});

export const artifactControlSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().min(1),
    type: z.literal("range"),
    label: z.string().min(1),
    min: z.number(),
    max: z.number(),
    step: z.number().positive(),
    value: z.number(),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("toggle"),
    label: z.string().min(1),
    value: z.boolean(),
  }),
]);
```

Add fields to `artifactRecordSchema` and `createExperienceInputSchema`:

```ts
lessonMode: lessonModeSchema.default("guided_walkthrough"),
interactionGoal: z.string().min(1).optional(),
sources: z.array(artifactSourceSchema).max(4).optional(),
controls: z.array(artifactControlSchema).max(6).optional(),
walkthroughSteps: z.array(walkthroughStepSchema),
```

Export inferred types:

```ts
export type LessonMode = z.infer<typeof lessonModeSchema>;
export type ArtifactSource = z.infer<typeof artifactSourceSchema>;
export type ArtifactControl = z.infer<typeof artifactControlSchema>;
```

- [ ] **Step 4: Implement persistence type fields**

In `lib/cloud/threadRecords.ts`, add optional metadata fields to `ArtifactMetadataRecord`:

```ts
lessonMode?: ArtifactRecord["lessonMode"];
interactionGoal?: ArtifactRecord["interactionGoal"];
sources?: ArtifactRecord["sources"];
controls?: ArtifactRecord["controls"];
```

Update any artifact record conversion functions in this file to copy these fields when present. If a function builds an `ArtifactMetadataRecord`, include:

```ts
lessonMode: artifact.lessonMode,
interactionGoal: artifact.interactionGoal,
sources: artifact.sources,
controls: artifact.controls,
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npx vitest run tests/artifact-validator.test.ts tests/thread-records.test.ts tests/thread-session.test.ts
```

Expected: tests progress past schema errors. Some validator tests may still fail until Task 4 adds mode-specific rules.

- [ ] **Step 6: Commit**

```bash
git add lib/artifacts/artifactTypes.ts lib/cloud/threadRecords.ts tests/artifact-validator.test.ts tests/thread-records.test.ts tests/thread-session.test.ts
git commit -m "feat: extend artifact lesson metadata"
```

---

### Task 2: Add Planner Tool Sink and Agent Factories

**Files:**
- Create: `lib/agent/tools/lessonPlanTool.ts`
- Modify: `lib/agent/prompts.ts`
- Modify: `lib/agent/agents.ts`
- Test: `tests/agent-tools.test.ts`

- [ ] **Step 1: Write failing Planner tool test**

In `tests/agent-tools.test.ts`, import `makeLessonPlanToolSink` and add:

```ts
it("records a structured lesson plan from the planner tool", async () => {
  const sink = makeLessonPlanToolSink();
  const output = await sink.tool.invoke(undefined as never, JSON.stringify({
    artifactNeeded: true,
    lessonMode: "playground",
    title: "Elastic Potential Energy Playground",
    topic: "elastic potential energy",
    rationale: "The core idea is best learned by changing displacement and seeing energy respond.",
    interactionGoal: "Adjust displacement and watch U = 1/2kx^2 update.",
    researchUsed: false,
    sources: [],
    requiredComponents: ["spring", "mass", "energy bar"],
    builderBrief: "Build a spring-mass playground with a displacement slider and energy bar.",
  }));

  expect(output).toMatchObject({ ok: true, lessonMode: "playground" });
  expect(sink.getResult()).toMatchObject({
    ok: true,
    plan: {
      artifactNeeded: true,
      lessonMode: "playground",
      requiredComponents: ["spring", "mass", "energy bar"],
    },
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run tests/agent-tools.test.ts -t "records a structured lesson plan"
```

Expected: FAIL because `makeLessonPlanToolSink` does not exist.

- [ ] **Step 3: Create Planner tool sink**

Create `lib/agent/tools/lessonPlanTool.ts`:

```ts
import { tool, type Tool } from "@openai/agents";
import { z } from "zod";
import { artifactSourceSchema, lessonModeSchema, type ArtifactSource, type LessonMode } from "@/lib/artifacts/artifactTypes";

const lessonPlanToolInputSchema = z.object({
  artifactNeeded: z.boolean(),
  lessonMode: lessonModeSchema.nullable(),
  title: z.string().min(1).nullable(),
  topic: z.string().min(1).nullable(),
  rationale: z.string().min(1),
  interactionGoal: z.string().min(1).nullable(),
  researchUsed: z.boolean(),
  sources: z.array(artifactSourceSchema).max(4),
  requiredComponents: z.array(z.string().min(1)).max(8),
  builderBrief: z.string().min(1).nullable(),
});

export type LessonPlan = {
  artifactNeeded: boolean;
  lessonMode?: LessonMode;
  title?: string;
  topic?: string;
  rationale: string;
  interactionGoal?: string;
  researchUsed: boolean;
  sources: ArtifactSource[];
  requiredComponents: string[];
  builderBrief?: string;
};

export type LessonPlanToolSink = {
  tool: Tool;
  getResult: () => { ok: true; plan: LessonPlan } | null;
};

function normalizeLessonPlan(input: z.infer<typeof lessonPlanToolInputSchema>): LessonPlan {
  return {
    artifactNeeded: input.artifactNeeded,
    lessonMode: input.lessonMode ?? undefined,
    title: input.title ?? undefined,
    topic: input.topic ?? undefined,
    rationale: input.rationale,
    interactionGoal: input.interactionGoal ?? undefined,
    researchUsed: input.researchUsed,
    sources: input.sources,
    requiredComponents: input.requiredComponents,
    builderBrief: input.builderBrief ?? undefined,
  };
}

export function makeLessonPlanToolSink(): LessonPlanToolSink {
  let result: { ok: true; plan: LessonPlan } | null = null;

  const chooseLessonPlanTool = tool({
    name: "choose_lesson_plan",
    description: "Choose whether an artifact is needed, whether to use playground or guided_walkthrough, and produce the Builder brief.",
    parameters: lessonPlanToolInputSchema,
    async execute(input) {
      const plan = normalizeLessonPlan(input);
      result = { ok: true, plan };
      return {
        ok: true,
        artifactNeeded: plan.artifactNeeded,
        lessonMode: plan.lessonMode ?? null,
        title: plan.title ?? null,
      };
    },
  });

  return {
    tool: chooseLessonPlanTool,
    getResult: () => result,
  };
}
```

- [ ] **Step 4: Split agent prompts**

In `lib/agent/prompts.ts`, keep the exported name `PARALLAX_AGENT_PROMPT` for compatibility but add:

```ts
export const PLANNER_AGENT_PROMPT = `
You are the Parallax Lesson Planner. Decide whether the user needs a generated learning room.

If the user asks for ordinary conversation, app help, or clarification, answer directly and do not call choose_lesson_plan.

If the user asks to learn, visualize, simulate, inspect, or explore a STEM topic, choose the best demo-supported lesson mode and call choose_lesson_plan exactly once.

Supported lesson modes:
- playground: Use for parameter-driven concepts where manipulating a variable reveals the idea, such as elastic potential energy, vectors, waves, fields, proportionality, or equilibrium.
- guided_walkthrough: Use for ordered processes or systems with meaningful stages, such as jet engines, photosynthesis, heart circulation, neural signaling, or a mechanism in a patent.

Use research_stem_topic before choose_lesson_plan when the topic is niche, current, source-specific, patent-specific, paper-specific, company/product-specific, or when the user asks for grounded/source-backed learning. Skip research for stable foundational topics.

The plan must give the Builder a concise visual brief, required components, and an interaction goal. For playground lessons, prefer one clear control over many controls.
`;

export const BUILDER_AGENT_PROMPT = `
You are the Parallax Scene Builder. You receive a lesson plan and must call create_experience exactly once.

Follow the lessonMode in the plan. For playground, create local Three.js geometry with registerComponent calls, call registerControl for at least one meaningful control, and call setWalkthroughSteps([]). For guided_walkthrough, create local Three.js geometry and call setWalkthroughSteps with 4 to 6 concise steps.

Generate only sceneSource JavaScript plus matching metadata. Do not generate a full HTML document.

sceneSource contract:
- Assume THREE, scene, camera, renderer, root, controls, registerComponent, registerControl, setWalkthroughSteps, setStatus, and fitCameraTo already exist.
- Create visible 3D objects under root.
- Call registerComponent(id, label, object3D, metadata) for at least three meaningful clickable components.
- Use deterministic local geometry, materials, canvas textures, math, and animation.
- Do not use fetch, XMLHttpRequest, WebSocket, EventSource, dynamic import, script tags, iframe, localStorage, cookies, or remote assets.
- Use valid JavaScript identifiers only.
`;

export const TUTOR_AGENT_PROMPT = `
You are the Parallax Tutor. Use the active artifact context, lessonMode, selected component, and active step to answer briefly.

For playground artifacts, invite the learner to manipulate controls and explain cause/effect. For guided_walkthrough artifacts, move through steps or focus components when helpful.
`;

export const PARALLAX_AGENT_PROMPT = BUILDER_AGENT_PROMPT;
```

- [ ] **Step 5: Add named factories**

In `lib/agent/agents.ts`:

```ts
import { Agent, type Tool } from "@openai/agents";
import { BUILDER_AGENT_PROMPT, PLANNER_AGENT_PROMPT, TUTOR_AGENT_PROMPT } from "./prompts";

const model = process.env.OPENAI_MODEL ?? "gpt-5.4";

function makeAgent(name: string, instructions: string, tools: Tool[]) {
  return new Agent({ name, model, instructions, tools });
}

export function makePlannerAgent(tools: Tool[]) {
  return makeAgent("Parallax Lesson Planner", PLANNER_AGENT_PROMPT, tools);
}

export function makeBuilderAgent(tools: Tool[]) {
  return makeAgent("Parallax Scene Builder", BUILDER_AGENT_PROMPT, tools);
}

export function makeTutorAgent(tools: Tool[]) {
  return makeAgent("Parallax Tutor", TUTOR_AGENT_PROMPT, tools);
}

export function makeParallaxAgent(tools: Tool[]) {
  return makeBuilderAgent(tools);
}
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
npx vitest run tests/agent-tools.test.ts
```

Expected: PASS after imports are updated.

- [ ] **Step 7: Commit**

```bash
git add lib/agent/tools/lessonPlanTool.ts lib/agent/prompts.ts lib/agent/agents.ts tests/agent-tools.test.ts
git commit -m "feat: add structured lesson planner tool"
```

---

### Task 3: Orchestrate Planner Then Builder in Chat Mode

**Files:**
- Modify: `lib/agent/routes.ts`
- Test: `tests/agent-routes.test.ts`

- [ ] **Step 1: Write failing route tests for two-stage orchestration**

Update the existing `tests/agent-routes.test.ts` mock for `@/lib/agent/tools/createExperienceTool` to keep working. Add a mock for `@/lib/agent/tools/lessonPlanTool`:

```ts
const lessonPlanState = vi.hoisted(() => ({
  result: null as unknown,
}));

vi.mock("@/lib/agent/tools/lessonPlanTool", () => {
  return {
    makeLessonPlanToolSink: vi.fn(() => ({
      tool: {},
      getResult: () => lessonPlanState.result,
    })),
  };
});
```

Add:

```ts
it("plans then builds an artifact when the planner selects a lesson mode", async () => {
  lessonPlanState.result = {
    ok: true,
    plan: {
      artifactNeeded: true,
      lessonMode: "playground",
      title: "Elastic Potential Energy Playground",
      topic: "elastic potential energy",
      rationale: "A variable playground fits this concept.",
      interactionGoal: "Adjust displacement and observe stored energy.",
      researchUsed: false,
      sources: [],
      requiredComponents: ["spring", "mass", "energy bar"],
      builderBrief: "Build a spring-mass playground.",
    },
  };
  createExperienceState.result = { ok: true, artifact: { ...artifact, lessonMode: "playground", walkthroughSteps: [] } };
  mockedRun
    .mockResolvedValueOnce({ finalOutput: "Plan ready." } as Awaited<ReturnType<typeof run>>)
    .mockResolvedValueOnce({ finalOutput: "I built an adaptive playground." } as Awaited<ReturnType<typeof run>>);

  const response = await handleAgentRoute({ mode: "chat", message: "Teach me elastic potential energy", messages: [] });

  expect(mockedRun).toHaveBeenCalledTimes(2);
  expect(mockedRun.mock.calls[1]?.[1]).toContain('"lessonMode":"playground"');
  expect(response).toMatchObject({
    message: "I built an adaptive playground.",
    artifact: { lessonMode: "playground" },
    error: null,
  });
});
```

Add a no-artifact test:

```ts
it("lets the planner answer directly without running the builder", async () => {
  lessonPlanState.result = null;
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run tests/agent-routes.test.ts
```

Expected: FAIL because chat mode still runs only one agent.

- [ ] **Step 3: Implement planner preparation**

In `lib/agent/routes.ts`, replace the chat imports:

```ts
import { makeBuilderAgent, makePlannerAgent, makeTutorAgent } from "./agents";
import { makeLessonPlanToolSink, type LessonPlan } from "./tools/lessonPlanTool";
```

Change `prepareChatMode`:

```ts
function prepareChatMode(request: z.infer<typeof chatAgentRequestSchema>) {
  const userMessage = makeMessage("user", request.message);
  const lessonPlan = makeLessonPlanToolSink();
  const researchStemTopic = makeResearchStemTopicTool();
  const plannerAgent = makePlannerAgent([researchStemTopic, lessonPlan.tool]);
  const createExperience = makeCreateExperienceToolSink();
  const builderAgent = makeBuilderAgent([createExperience.tool]);
  const history = recentConversation(request.messages);
  const plannerPrompt = `Mode: main chat
${history ? `Conversation so far:\n${history}\n\n` : ""}User request:\n${request.message}`;

  return { userMessage, lessonPlan, createExperience, plannerAgent, builderAgent, plannerPrompt };
}
```

Add:

```ts
function makeBuilderPrompt(plan: LessonPlan, requestMessage: string): string {
  return `Lesson plan:\n${JSON.stringify(plan)}\n\nOriginal user request:\n${requestMessage}`;
}
```

- [ ] **Step 4: Implement non-streaming chat orchestration**

Replace `handleChatMode` with:

```ts
async function handleChatMode(request: z.infer<typeof chatAgentRequestSchema>) {
  const prepared = prepareChatMode(request);
  const plannerResult = await run(prepared.plannerAgent, prepared.plannerPrompt, { maxTurns: 6 });
  const planned = prepared.lessonPlan.getResult();

  if (!planned?.plan.artifactNeeded) {
    const assistantMessage = makeMessage(
      "assistant",
      finalOutputText(plannerResult.finalOutput, "I can help you learn STEM topics or build an interactive 3D experience."),
    );
    await persistIfThreaded(request.userId, request.threadId, [prepared.userMessage, assistantMessage]);
    return { message: assistantMessage.content, trace: [], artifact: null, error: null };
  }

  const builderPrompt = makeBuilderPrompt(planned.plan, request.message);
  const builderResult = await run(prepared.builderAgent, builderPrompt, { maxTurns: 8 });
  return finishChatMode(request, prepared.userMessage, builderResult, prepared.createExperience, planned.plan);
}
```

Update `finishChatMode` signature and trace:

```ts
async function finishChatMode(
  request: z.infer<typeof chatAgentRequestSchema>,
  userMessage: ChatMessage,
  result: { finalOutput?: unknown },
  createExperience: ReturnType<typeof makeCreateExperienceToolSink>,
  plan?: LessonPlan,
) {
  const artifactResult = createExperience.getResult();
  const trace = plan
    ? [
        "Choosing lesson mode",
        plan.researchUsed ? "Grounding lesson plan with Exa" : "Skipping research for stable topic",
        `Selected ${plan.lessonMode ?? "unknown"} lesson mode`,
        "Generating interactive 3D artifact",
        "Validating artifact contract",
      ]
    : [];
  // Keep the existing artifact/no-artifact persistence branches, using this trace value.
}
```

- [ ] **Step 5: Update learning-room agent factory**

In `prepareLearningRoomMode`, replace:

```ts
const agent = makeParallaxAgent([commandSink.tool]);
```

with:

```ts
const agent = makeTutorAgent([commandSink.tool]);
```

Add `lessonMode`, `interactionGoal`, `controls`, and `sources` to the artifact context object.

- [ ] **Step 6: Update streaming orchestration**

In `runChatModeStream`, run the Planner first without streaming, then stream Builder only when an artifact is planned:

```ts
async function runChatModeStream(
  request: z.infer<typeof chatAgentRequestSchema>,
  emit: (event: AgentStreamEvent) => void,
  signal: AbortSignal,
) {
  const prepared = prepareChatMode(request);
  emit({ type: "status", message: "Choosing the lesson format..." });
  const plannerResult = await run(prepared.plannerAgent, prepared.plannerPrompt, { maxTurns: 6, signal });
  const planned = prepared.lessonPlan.getResult();

  if (!planned?.plan.artifactNeeded) {
    return finishDirectPlannerAnswer(request, prepared.userMessage, plannerResult);
  }

  emit({ type: "status", message: planned.plan.researchUsed ? "Using grounded sources..." : `Selected ${planned.plan.lessonMode} mode...` });
  emit({ type: "status", message: "Building the interactive artifact..." });
  const result = await run(prepared.builderAgent, makeBuilderPrompt(planned.plan, request.message), {
    maxTurns: 8,
    stream: true,
    signal,
  });
  await emitRunDeltas(result, emit);
  await waitForStreamCompletion(result);
  return finishChatMode(request, prepared.userMessage, result, prepared.createExperience, planned.plan);
}
```

Add `finishDirectPlannerAnswer` using the no-artifact branch from `finishChatMode`.

- [ ] **Step 7: Update route tests**

Adjust existing route tests that expected one `run` call for artifact creation to expect two calls when `lessonPlanState.result` has `artifactNeeded: true`. Keep greeting/no-artifact tests as one call.

- [ ] **Step 8: Run focused tests**

Run:

```bash
npx vitest run tests/agent-routes.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/agent/routes.ts tests/agent-routes.test.ts
git commit -m "feat: orchestrate planner and builder agents"
```

---

### Task 4: Make create_experience Mode-Aware

**Files:**
- Modify: `lib/agent/tools/createExperienceTool.ts`
- Modify: `lib/artifacts/artifactValidator.ts`
- Test: `tests/agent-tools.test.ts`
- Test: `tests/artifact-validator.test.ts`

- [ ] **Step 1: Write failing validation tests**

In `tests/artifact-validator.test.ts`, add:

```ts
it("rejects playground artifacts without registered controls", () => {
  const result = createArtifactRecord({
    lessonMode: "playground",
    topic: "elastic potential energy",
    title: "Elastic Potential Energy Playground",
    summary: "Adjust displacement.",
    interactionGoal: "Adjust displacement and watch energy change.",
    sceneSource: `
const spring = new THREE.Group();
const mass = new THREE.Group();
const bar = new THREE.Group();
root.add(spring, mass, bar);
registerComponent("spring", "Spring", spring, {});
registerComponent("mass", "Mass", mass, {});
registerComponent("energy-bar", "Energy Bar", bar, {});
setWalkthroughSteps([]);
`,
    components: [
      { id: "spring", label: "Spring" },
      { id: "mass", label: "Mass" },
      { id: "energy-bar", label: "Energy Bar" },
    ],
    controls: [],
    walkthroughSteps: [],
  });

  expect(result).toMatchObject({ ok: false });
  if (!result.ok) expect(result.error).toContain("playground");
});

it("rejects guided walkthrough artifacts without steps", () => {
  const result = createArtifactRecord({
    lessonMode: "guided_walkthrough",
    topic: "jet engine",
    title: "Jet Engine Explorer",
    summary: "Trace airflow.",
    sceneSource: `
const fan = new THREE.Group();
const compressor = new THREE.Group();
const turbine = new THREE.Group();
root.add(fan, compressor, turbine);
registerComponent("fan", "Fan", fan, {});
registerComponent("compressor", "Compressor", compressor, {});
registerComponent("turbine", "Turbine", turbine, {});
setWalkthroughSteps([]);
`,
    components: [
      { id: "fan", label: "Fan" },
      { id: "compressor", label: "Compressor" },
      { id: "turbine", label: "Turbine" },
    ],
    walkthroughSteps: [],
  });

  expect(result).toMatchObject({ ok: false });
  if (!result.ok) expect(result.error).toContain("guided_walkthrough");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run tests/artifact-validator.test.ts tests/agent-tools.test.ts
```

Expected: FAIL until mode-specific validation and tool normalization exist.

- [ ] **Step 3: Update create_experience tool schema**

In `lib/agent/tools/createExperienceTool.ts`, import `lessonModeSchema` and add a `controlToolInputSchema`:

```ts
const controlToolInputSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().min(1),
    type: z.literal("range"),
    label: z.string().min(1),
    min: z.number(),
    max: z.number(),
    step: z.number(),
    value: z.number(),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("toggle"),
    label: z.string().min(1),
    value: z.boolean(),
  }),
]);
```

Add to `createExperienceToolInputSchema`:

```ts
lessonMode: lessonModeSchema,
interactionGoal: z.string().min(1).nullable(),
sources: z.array(z.object({
  title: z.string().min(1),
  url: z.string().url(),
  summary: z.string().min(1),
})).max(4).nullable(),
controls: z.array(controlToolInputSchema).max(6).nullable(),
walkthroughSteps: z.array(/* existing step object */),
```

Update `normalizeToolInput`:

```ts
interactionGoal: input.interactionGoal ?? undefined,
sources: input.sources ?? undefined,
controls: input.controls ?? undefined,
```

- [ ] **Step 4: Update validator syntax parameters**

In `lib/artifacts/artifactValidator.ts`, add `"registerControl"` to the `new Function` parameter list used by `syntaxErrorMessage`.

Change `validateSceneSource` to accept the mode:

```ts
export function validateSceneSource(source: string): ArtifactValidationResult {
  // Keep existing static checks.
}
```

Keep this source-level function as-is for backward compatibility. Add a record-level helper:

```ts
function validateArtifactMode(input: CreateExperienceInput): ArtifactValidationResult {
  if (input.lessonMode === "playground") {
    if (input.walkthroughSteps.length !== 0) {
      return { ok: false, error: "playground artifacts must not include walkthrough steps." };
    }
    if (!input.controls?.length || !/registerControl\s*\(/.test(input.sceneSource)) {
      return { ok: false, error: "playground artifacts must declare controls and call registerControl." };
    }
  }

  if (input.lessonMode === "guided_walkthrough" && input.walkthroughSteps.length < 1) {
    return { ok: false, error: "guided_walkthrough artifacts must include walkthrough steps." };
  }

  return { ok: true };
}
```

Call it in `createArtifactRecord` after source validation and before missing component checks:

```ts
const modeValidation = validateArtifactMode(parsed.data);
if (!modeValidation.ok) return modeValidation;
```

Also verify declared control IDs appear in `sceneSource`:

```ts
const missingControlIds = (parsed.data.controls ?? [])
  .map((control) => control.id)
  .filter((id) => !parsed.data.sceneSource.includes(id));
if (missingControlIds.length) {
  return { ok: false, error: `Generated scene source does not reference declared control ids: ${missingControlIds.join(", ")}` };
}
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npx vitest run tests/artifact-validator.test.ts tests/agent-tools.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/agent/tools/createExperienceTool.ts lib/artifacts/artifactValidator.ts tests/agent-tools.test.ts tests/artifact-validator.test.ts
git commit -m "feat: validate adaptive lesson modes"
```

---

### Task 5: Adapt Artifact Runtime Chrome and Controls

**Files:**
- Modify: `lib/artifacts/artifactTemplate.ts`
- Test: `tests/artifact-template.test.ts`

- [ ] **Step 1: Write failing template tests**

In `tests/artifact-template.test.ts`, add:

```ts
it("hides walkthrough buttons for playground artifacts and exposes registerControl", () => {
  const html = renderArtifactHtml({
    id: "artifact-playground",
    lessonMode: "playground",
    title: "Elastic Energy Playground",
    topic: "elastic potential energy",
    summary: "Adjust displacement and watch energy change.",
    interactionGoal: "Adjust displacement.",
    sceneSource: `
const spring = new THREE.Group();
const mass = new THREE.Group();
const bar = new THREE.Group();
root.add(spring, mass, bar);
registerComponent("spring", "Spring", spring, {});
registerComponent("mass", "Mass", mass, {});
registerComponent("energy-bar", "Energy Bar", bar, {});
registerControl({ id: "displacement", type: "range", label: "Displacement", min: -2, max: 2, step: 0.1, value: 1 }, function(value) { mass.position.x = value; });
setWalkthroughSteps([]);
`,
    components: [
      { id: "spring", label: "Spring" },
      { id: "mass", label: "Mass" },
      { id: "energy-bar", label: "Energy Bar" },
    ],
    controls: [{ id: "displacement", type: "range", label: "Displacement", min: -2, max: 2, step: 0.1, value: 1 }],
    walkthroughSteps: [],
  });

  expect(html).toContain("registerControl");
  expect(html).toContain("data-mode=\"playground\"");
  expect(html).toContain("playground-controls");
  expect(html).not.toContain("id=\"prev-step\"");
  expect(html).not.toContain("id=\"next-step\"");
  expect(html).not.toContain("id=\"start-walkthrough\"");
});
```

Add a guided control test:

```ts
it("keeps walkthrough buttons for guided walkthrough artifacts", () => {
  const html = renderArtifactHtml({
    id: "artifact-guided",
    lessonMode: "guided_walkthrough",
    title: "Jet Engine Explorer",
    topic: "jet engine",
    summary: "Trace airflow.",
    sceneSource: `
const fan = new THREE.Group();
const compressor = new THREE.Group();
const turbine = new THREE.Group();
root.add(fan, compressor, turbine);
registerComponent("fan", "Fan", fan, {});
registerComponent("compressor", "Compressor", compressor, {});
registerComponent("turbine", "Turbine", turbine, {});
setWalkthroughSteps([{ id: "intro", title: "Intake", narration: "Air enters.", targetComponentIds: ["fan"] }]);
`,
    components: [
      { id: "fan", label: "Fan" },
      { id: "compressor", label: "Compressor" },
      { id: "turbine", label: "Turbine" },
    ],
    walkthroughSteps: [{ id: "intro", title: "Intake", narration: "Air enters.", targetComponentIds: ["fan"] }],
  });

  expect(html).toContain("data-mode=\"guided_walkthrough\"");
  expect(html).toContain("id=\"prev-step\"");
  expect(html).toContain("id=\"next-step\"");
  expect(html).toContain("id=\"start-walkthrough\"");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run tests/artifact-template.test.ts
```

Expected: FAIL because the runtime always renders walkthrough controls and has no `registerControl`.

- [ ] **Step 3: Add payload fields and mode booleans**

In `renderArtifactHtml`, include:

```ts
lessonMode: input.lessonMode,
interactionGoal: input.interactionGoal,
sources: input.sources,
controls: input.controls,
```

Before returning the template string:

```ts
const lessonMode = input.lessonMode ?? "guided_walkthrough";
const hasWalkthroughChrome = lessonMode === "guided_walkthrough" && input.walkthroughSteps.length > 0;
```

- [ ] **Step 4: Render adaptive controls markup**

Change `<body>` to include mode:

```html
<body data-mode="${escapeHtml(lessonMode)}">
```

Render the walkthrough buttons conditionally:

```ts
${hasWalkthroughChrome ? `
      <button id="prev-step" type="button">Prev</button>
      <button id="next-step" type="button">Next</button>
      <button id="start-walkthrough" type="button">Walkthrough</button>
` : ""}
      <div id="playground-controls" aria-label="Artifact controls"></div>
      <button id="explode" type="button">Explode</button>
      <button id="reset-camera" type="button">Reset</button>
      <button id="toggle-labels" type="button">Labels</button>
```

For playground captions, keep the summary visible instead of an empty step:

```ts
const initialCaptionTitle = hasWalkthroughChrome ? input.title : input.title;
const initialCaptionCopy = input.interactionGoal ?? input.summary;
```

- [ ] **Step 5: Implement `registerControl` runtime**

Inside `loadThree().then`, after `window.registerComponent`, add:

```js
      const controlCallbacks = new Map();
      const playgroundControls = document.getElementById("playground-controls");

      function readControlValue(control, input) {
        if (control.type === "toggle") return input.checked;
        return Number(input.value);
      }

      window.registerControl = function registerControl(control, onChange) {
        if (!control || !control.id || !control.label || typeof onChange !== "function") {
          throw new Error("registerControl requires a control descriptor and callback");
        }
        if (controlCallbacks.has(control.id)) {
          throw new Error("Duplicate control id: " + control.id);
        }
        controlCallbacks.set(control.id, onChange);

        const label = document.createElement("label");
        label.className = "control";
        label.textContent = control.label;

        const input = document.createElement("input");
        input.id = "control-" + control.id;
        input.type = control.type === "toggle" ? "checkbox" : "range";
        if (control.type === "range") {
          input.min = String(control.min);
          input.max = String(control.max);
          input.step = String(control.step);
          input.value = String(control.value);
        } else {
          input.checked = Boolean(control.value);
        }

        const value = document.createElement("span");
        value.className = "control-value";
        value.textContent = String(readControlValue(control, input));

        input.addEventListener("input", () => {
          const nextValue = readControlValue(control, input);
          value.textContent = String(nextValue);
          onChange(nextValue);
        });

        label.appendChild(input);
        label.appendChild(value);
        playgroundControls.appendChild(label);
        onChange(readControlValue(control, input));
      };
```

Add `"registerControl"` to the `new Function` argument list and pass `window.registerControl` into `runScene`.

- [ ] **Step 6: Guard walkthrough button handlers**

Replace direct handlers:

```js
document.getElementById("prev-step").onclick = ...
```

with:

```js
      const prevStep = document.getElementById("prev-step");
      if (prevStep) prevStep.onclick = () => goToStep(currentStepIndex - 1, true);
```

Repeat for `next-step` and `start-walkthrough`. Keep reset/explode/labels always present.

- [ ] **Step 7: Add control CSS**

Add to the template style:

```css
    #playground-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .control {
      display: grid;
      grid-template-columns: auto minmax(90px, 1fr) auto;
      gap: 8px;
      align-items: center;
      color: var(--text);
      font-size: 12px;
    }
    .control input[type="range"] {
      width: 120px;
    }
    .control-value {
      color: var(--muted);
      min-width: 32px;
      text-align: right;
    }
```

- [ ] **Step 8: Run focused tests**

Run:

```bash
npx vitest run tests/artifact-template.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/artifacts/artifactTemplate.ts tests/artifact-template.test.ts
git commit -m "feat: adapt artifact runtime to lesson mode"
```

---

### Task 6: Tune Tutor Context for Adaptive Lessons

**Files:**
- Modify: `lib/agent/routes.ts`
- Modify: `lib/agent/prompts.ts`
- Test: `tests/agent-routes.test.ts`

- [ ] **Step 1: Write failing tutor context assertion**

In the learning-room route test, assert that the prompt includes the mode:

```ts
it("passes lesson mode and controls into learning-room tutor context", async () => {
  const playgroundArtifact = {
    ...artifact,
    lessonMode: "playground" as const,
    interactionGoal: "Adjust displacement and observe stored energy.",
    controls: [{ id: "displacement", type: "range" as const, label: "Displacement", min: -2, max: 2, step: 0.1, value: 1 }],
    walkthroughSteps: [],
  };
  mockedRun.mockResolvedValueOnce({ finalOutput: "Try moving the displacement slider." } as Awaited<ReturnType<typeof run>>);

  await handleAgentRoute({
    mode: "learning_room",
    message: "What should I try?",
    artifact: playgroundArtifact,
    messages: [],
    selectedComponent: null,
    activeStepId: null,
  });

  expect(mockedRun.mock.calls[0]?.[1]).toContain('"lessonMode":"playground"');
  expect(mockedRun.mock.calls[0]?.[1]).toContain('"controls"');
});
```

- [ ] **Step 2: Run test to verify it fails if context is missing fields**

Run:

```bash
npx vitest run tests/agent-routes.test.ts -t "passes lesson mode"
```

Expected: FAIL until route context includes the fields.

- [ ] **Step 3: Add adaptive context fields**

In `prepareLearningRoomMode`, add:

```ts
lessonMode: request.artifact.lessonMode,
interactionGoal: request.artifact.interactionGoal,
controls: request.artifact.controls ?? [],
sources: request.artifact.sources ?? [],
```

to the artifact context.

- [ ] **Step 4: Confirm Tutor prompt mentions mode behavior**

In `TUTOR_AGENT_PROMPT`, keep:

```txt
For playground artifacts, invite the learner to manipulate controls and explain cause/effect. For guided_walkthrough artifacts, move through steps or focus components when helpful.
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npx vitest run tests/agent-routes.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/agent/routes.ts lib/agent/prompts.ts tests/agent-routes.test.ts
git commit -m "feat: pass adaptive lesson context to tutor"
```

---

### Task 7: Verify Demo Behavior End to End

**Files:**
- No source files unless verification exposes a defect.

- [ ] **Step 1: Run full unit suite**

Run:

```bash
npm run test
```

Expected: all Vitest files pass.

- [ ] **Step 2: Run production build**

Run:

```bash
npm run build
```

Expected: Next.js build completes without TypeScript errors.

- [ ] **Step 3: Start dev server**

Run:

```bash
npm run dev
```

Expected: Next.js reports a local URL. Use the reported port if `3000` is occupied.

- [ ] **Step 4: Manual demo check for playground**

In the app, ask:

```txt
Give me a visualization of elastic potential energy
```

Expected:

- Planner trace includes choosing lesson mode.
- Artifact title references elastic potential energy.
- Artifact does not show walkthrough buttons in the iframe.
- Artifact shows at least one control, preferably displacement.
- Moving the control visibly changes the spring/mass/energy representation.
- Tutor can answer "what should I try?" by referring to the control.

- [ ] **Step 5: Manual demo check for guided walkthrough**

In a new chat, ask:

```txt
Show me how a jet engine works
```

Expected:

- Planner chooses `guided_walkthrough`.
- Artifact shows walkthrough buttons in the iframe.
- The scene has at least three registered components.
- Next/Prev changes caption and camera focus.
- Tutor can focus an engine component or move to a step.

- [ ] **Step 6: Manual demo check for Exa-worthy topic**

With `EXA_API_KEY` configured, ask:

```txt
Teach me the invention described in patent US 12000000
```

Expected:

- Planner calls `research_stem_topic`.
- Plan records `researchUsed: true` and sources when Exa returns them.
- Assistant output says the room is grounded in retrieved source context.
- If Exa returns no sources, the plan still proceeds with a note and does not crash.

- [ ] **Step 7: Commit verification fixes**

If verification exposed a defect, commit only the fix:

```bash
git add <files-that-fixed-the-defect>
git commit -m "fix: stabilize adaptive lesson demo"
```

If no defects were found, do not create an empty commit.

---

## Self-Review

- Spec coverage: The plan covers adaptive lesson mode selection, Exa-aware planning, Builder generation, runtime chrome adaptation, safe controls, Tutor context, persistence, and tests.
- Placeholder scan: No implementation placeholders remain in the plan. Future modes are intentionally excluded from demo scope.
- Type consistency: The plan uses `lessonMode`, `interactionGoal`, `sources`, and `controls` consistently across schemas, route context, persistence metadata, and runtime payloads.
- Scope check: This is a single cohesive feature because Planner, Builder, tool schema, and runtime all need the same `lessonMode` contract to produce working demo behavior.
