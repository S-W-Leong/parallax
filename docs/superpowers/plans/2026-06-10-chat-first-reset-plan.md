# Chat-First Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dashboard-heavy Parallax UI with a simple chat-first experience, a slim hover-expandable thread rail, a focused learning room, and true token streaming with Stop support.

**Architecture:** Keep the existing Next.js App Router, React components, session reducer, and thread persistence model. Add a small stream protocol around `/api/agent`, reshape the app shell into a reusable sidebar plus content area, and simplify proposal/learning-room panels while preserving the green-and-white technical lab style.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Vitest, OpenAI Agents SDK `run(..., { stream: true })`, Server-Sent Events over `fetch`, existing DynamoDB/S3 thread persistence.

---

## Scope Check

The approved spec touches UI layout and streaming. They are coupled through the user interaction after send, so this plan keeps them together but splits work into small testable tasks. Each task can be verified independently before moving on.

## File Structure

- Modify `lib/artifacts/artifactTypes.ts`: allow optional `learningOutcomes` on artifacts and optional client-only `status` on chat messages.
- Modify `lib/artifacts/artifactValidator.ts`: preserve `learningOutcomes` when creating records.
- Modify `lib/agent/tools/createExperienceTool.ts`: ask the agent tool for three friendly learning outcomes.
- Modify `lib/cloud/threadRecords.ts`: persist and hydrate optional `learningOutcomes`.
- Create `lib/artifacts/proposalCopy.ts`: pure helper for friendly fallback proposal outcomes.
- Modify `components/chat/ExperienceProposalCard.tsx`: render preview-rich proposal cards and compact rows.
- Create `lib/agent/streamProtocol.ts`: typed SSE event contract plus encoder/decoder helpers.
- Modify `lib/session/sessionReducer.ts`: support assistant draft start, replace, append, complete, stop, and artifact attach actions.
- Modify `lib/agent/routes.ts`: add a streaming route path while preserving the current JSON handler.
- Modify `app/api/agent/route.ts`: return `text/event-stream` when requested, JSON otherwise.
- Modify `components/chat/ChatComposer.tsx`: support Send vs Stop.
- Modify `components/chat/ChatThread.tsx`: render streaming/stopped states and proposal card modes.
- Modify `components/chat/ThreadSidebar.tsx`: implement slim, hover-expanded, and pinned-expanded rail behavior.
- Create `components/app/ChatHome.tsx`: keep main chat layout out of the root app component.
- Modify `components/app/ParallaxArtifactApp.tsx`: own sidebar state, stream request state, and shared app shell.
- Create `components/experience/WalkthroughStrip.tsx`: simple previous/next walkthrough strip.
- Modify `components/experience/LearningRoom.tsx`: remove inspector/command-log panels and use canvas + walkthrough + full-history tutor chat.
- Modify `components/experience/ArtifactFrame.tsx`: accept a compact mode without inspect/download toolbar for normal users.
- Modify `app/globals.css`: replace dashboard layout with chat-first shell, rail states, learning room layout, responsive drawer behavior, streaming message affordances.
- Modify tests in `tests/artifact-validator.test.ts`, `tests/thread-records.test.ts`, `tests/agent-routes.test.ts`, and `tests/session-reducer.test.ts`.
- Create `tests/proposal-copy.test.ts` and `tests/stream-protocol.test.ts`.

## Task 1: Proposal Copy And Artifact Metadata

**Files:**
- Modify: `lib/artifacts/artifactTypes.ts`
- Modify: `lib/artifacts/artifactValidator.ts`
- Modify: `lib/agent/tools/createExperienceTool.ts`
- Modify: `lib/cloud/threadRecords.ts`
- Create: `lib/artifacts/proposalCopy.ts`
- Create: `tests/proposal-copy.test.ts`
- Modify: `tests/artifact-validator.test.ts`
- Modify: `tests/thread-records.test.ts`

- [ ] **Step 1: Write failing proposal-copy tests**

Create `tests/proposal-copy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { learningOutcomesForArtifact } from "@/lib/artifacts/proposalCopy";
import type { ArtifactRecord } from "@/lib/artifacts/artifactTypes";

const baseArtifact: ArtifactRecord = {
  id: "artifact-1",
  title: "Jet Engine Lab",
  topic: "jet engines",
  summary: "Explore airflow, combustion, and thrust.",
  sceneSource: "registerComponent('a','A',root,{}); setWalkthroughSteps([{id:'s',title:'S',narration:'N',targetComponentIds:['a']}]);",
  html: "<!doctype html><html><body></body></html>",
  components: [
    { id: "fan", label: "Fan" },
    { id: "compressor", label: "Compressor" },
    { id: "combustor", label: "Combustor" },
  ],
  walkthroughSteps: [
    { id: "airflow", title: "Trace airflow", narration: "Follow air from intake to exhaust.", targetComponentIds: ["fan"] },
    { id: "heat", title: "Compare hot and cold zones", narration: "See where energy changes.", targetComponentIds: ["combustor"] },
    { id: "thrust", title: "See how thrust forms", narration: "Watch gases accelerate.", targetComponentIds: ["compressor"] },
  ],
  createdAt: "2026-06-10T00:00:00.000Z",
};

describe("learningOutcomesForArtifact", () => {
  it("uses explicit friendly learning outcomes first", () => {
    const outcomes = learningOutcomesForArtifact({
      ...baseArtifact,
      learningOutcomes: ["Trace airflow", "Compare hot and cold zones", "See how thrust forms"],
    });

    expect(outcomes).toEqual(["Trace airflow", "Compare hot and cold zones", "See how thrust forms"]);
  });

  it("falls back to walkthrough titles and limits the list to three", () => {
    expect(learningOutcomesForArtifact(baseArtifact)).toEqual([
      "Trace airflow",
      "Compare hot and cold zones",
      "See how thrust forms",
    ]);
  });
});
```

- [ ] **Step 2: Run proposal-copy test to verify failure**

Run: `npm run test -- tests/proposal-copy.test.ts`

Expected: FAIL because `lib/artifacts/proposalCopy.ts` does not exist.

- [ ] **Step 3: Add optional artifact learning outcomes type**

In `lib/artifacts/artifactTypes.ts`, add the reusable schema near `walkthroughStepSchema`:

```ts
export const learningOutcomeSchema = z.string().min(1).max(96);
```

Update `artifactRecordSchema`:

```ts
export const artifactRecordSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  topic: z.string().min(1),
  summary: z.string().min(1),
  sceneSource: z.string().min(1),
  html: z.string().min(1),
  components: z.array(artifactComponentSchema).min(1),
  walkthroughSteps: z.array(walkthroughStepSchema).min(1),
  learningOutcomes: z.array(learningOutcomeSchema).max(3).optional(),
  createdAt: z.string().min(1),
});
```

Update `createExperienceInputSchema`:

```ts
export const createExperienceInputSchema = z.object({
  topic: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  learningOutcomes: z.array(learningOutcomeSchema).min(1).max(3).optional(),
  sceneSource: z.string().min(1),
  components: z.array(artifactComponentSchema).min(3),
  walkthroughSteps: z.array(walkthroughStepSchema).min(1),
});
```

- [ ] **Step 4: Preserve outcomes through artifact creation**

No special code is needed in `lib/artifacts/artifactValidator.ts` beyond the schema addition because `createArtifactRecord()` spreads `parsed.data` into the record. Add this test to `tests/artifact-validator.test.ts`:

```ts
it("preserves friendly learning outcomes on created artifacts", () => {
  const result = createArtifactRecord({
    topic: "turbines",
    title: "Turbine Lab",
    summary: "Explore turbine stages.",
    learningOutcomes: ["Trace airflow", "Compare pressure zones", "See thrust form"],
    sceneSource: `
const a = new THREE.Group();
const b = new THREE.Group();
const c = new THREE.Group();
root.add(a, b, c);
registerComponent("fan", "Fan", a, {});
registerComponent("compressor", "Compressor", b, {});
registerComponent("combustor", "Combustor", c, {});
setWalkthroughSteps([{ id: "intro", title: "Trace airflow", narration: "Follow the path.", targetComponentIds: ["fan"] }]);
`,
    components: [
      { id: "fan", label: "Fan" },
      { id: "compressor", label: "Compressor" },
      { id: "combustor", label: "Combustor" },
    ],
    walkthroughSteps: [{ id: "intro", title: "Trace airflow", narration: "Follow the path.", targetComponentIds: ["fan"] }],
  });

  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.artifact.learningOutcomes).toEqual(["Trace airflow", "Compare pressure zones", "See thrust form"]);
  }
});
```

- [ ] **Step 5: Implement `learningOutcomesForArtifact`**

Create `lib/artifacts/proposalCopy.ts`:

```ts
import type { ArtifactRecord } from "./artifactTypes";

function clean(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function learningOutcomesForArtifact(artifact: ArtifactRecord): string[] {
  const explicit = unique((artifact.learningOutcomes ?? []).map(clean).filter(Boolean)).slice(0, 3);
  if (explicit.length) return explicit;

  const walkthrough = unique(artifact.walkthroughSteps.map((step) => clean(step.title)).filter(Boolean)).slice(0, 3);
  if (walkthrough.length >= 3) return walkthrough;

  const componentOutcomes = artifact.components
    .map((component) => `Explore ${clean(component.label).toLowerCase()}`)
    .filter((value) => value.length > "Explore ".length);

  return unique([...walkthrough, ...componentOutcomes]).slice(0, 3);
}
```

- [ ] **Step 6: Update create-experience tool schema**

In `lib/agent/tools/createExperienceTool.ts`, add `learningOutcomes` to `createExperienceToolInputSchema`:

```ts
learningOutcomes: z.array(z.string().min(1).max(96)).min(1).max(3).nullable(),
```

Update `normalizeToolInput()` to return it as optional:

```ts
learningOutcomes: input.learningOutcomes ?? undefined,
```

Place that property beside `summary` in the returned object.

- [ ] **Step 7: Persist and hydrate outcomes**

In `lib/cloud/threadRecords.ts`, add `learningOutcomes?: ArtifactRecord["learningOutcomes"];` to `ArtifactMetadataRecord`.

In `lib/cloud/threadStore.ts`, include `learningOutcomes` when hydrating artifacts:

```ts
learningOutcomes: record.learningOutcomes,
```

In `saveArtifact()`, include:

```ts
learningOutcomes: artifact.learningOutcomes,
```

Add this import in `tests/thread-records.test.ts`:

```ts
import type { ArtifactMetadataRecord } from "@/lib/cloud/threadRecords";
```

Add this test:

```ts
it("allows artifact metadata records to carry friendly learning outcomes", () => {
  const record: ArtifactMetadataRecord = {
    PK: "THREAD#thread-1",
    SK: "ARTIFACT#artifact-1",
    entityType: "artifact",
    threadId: "thread-1",
    artifactId: "artifact-1",
    title: "Jet Engine Lab",
    topic: "jet engines",
    summary: "Explore airflow, combustion, and thrust.",
    htmlS3Key: "artifacts/thread-1/artifact-1/index.html",
    sceneSourceS3Key: "artifacts/thread-1/artifact-1/scene.js",
    components: [
      { id: "fan", label: "Fan" },
      { id: "compressor", label: "Compressor" },
      { id: "combustor", label: "Combustor" },
    ],
    walkthroughSteps: [{ id: "intro", title: "Trace airflow", narration: "Follow the path.", targetComponentIds: ["fan"] }],
    learningOutcomes: ["Trace airflow", "Compare pressure zones", "See thrust form"],
    createdAt: "2026-06-10T00:00:00.000Z",
  };

  expect(record.learningOutcomes).toEqual(["Trace airflow", "Compare pressure zones", "See thrust form"]);
});
```

- [ ] **Step 8: Run artifact metadata tests**

Run:

```bash
npm run test -- tests/proposal-copy.test.ts tests/artifact-validator.test.ts tests/thread-records.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit proposal metadata work**

```bash
git add lib/artifacts/artifactTypes.ts lib/artifacts/artifactValidator.ts lib/artifacts/proposalCopy.ts lib/agent/tools/createExperienceTool.ts lib/cloud/threadRecords.ts lib/cloud/threadStore.ts tests/proposal-copy.test.ts tests/artifact-validator.test.ts tests/thread-records.test.ts
git commit -m "feat: simplify artifact proposal copy"
```

## Task 2: Stream Protocol And Draft Messages

**Files:**
- Create: `lib/agent/streamProtocol.ts`
- Create: `tests/stream-protocol.test.ts`
- Modify: `lib/artifacts/artifactTypes.ts`
- Modify: `lib/session/sessionReducer.ts`
- Modify: `tests/session-reducer.test.ts`

- [ ] **Step 1: Write failing stream protocol tests**

Create `tests/stream-protocol.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decodeAgentStreamEvents, encodeAgentStreamEvent } from "@/lib/agent/streamProtocol";

describe("agent stream protocol", () => {
  it("round trips status, delta, and done events", () => {
    const text = [
      encodeAgentStreamEvent({ type: "status", message: "Let me think this through..." }),
      encodeAgentStreamEvent({ type: "delta", delta: "Cells " }),
      encodeAgentStreamEvent({ type: "delta", delta: "store energy." }),
      encodeAgentStreamEvent({ type: "done", message: "Cells store energy.", trace: [], artifact: null, commands: [], error: null }),
    ].join("");

    expect(decodeAgentStreamEvents(text)).toEqual([
      { type: "status", message: "Let me think this through..." },
      { type: "delta", delta: "Cells " },
      { type: "delta", delta: "store energy." },
      { type: "done", message: "Cells store energy.", trace: [], artifact: null, commands: [], error: null },
    ]);
  });
});
```

- [ ] **Step 2: Write failing reducer draft tests**

Add to `tests/session-reducer.test.ts`:

```ts
it("updates an assistant draft while streaming", () => {
  const started = sessionReducer(createEmptySession(), {
    type: "assistant_draft_started",
    id: "draft-1",
    content: "Let me think this through...",
    artifactId: undefined,
  });
  const replaced = sessionReducer(started, { type: "assistant_draft_replaced", id: "draft-1", content: "Cells " });
  const appended = sessionReducer(replaced, { type: "assistant_draft_delta", id: "draft-1", delta: "store energy." });
  const completed = sessionReducer(appended, { type: "assistant_draft_completed", id: "draft-1", content: "Cells store energy." });

  expect(completed.messages).toHaveLength(1);
  expect(completed.messages[0]).toMatchObject({
    id: "draft-1",
    role: "assistant",
    content: "Cells store energy.",
    status: "complete",
  });
});

it("keeps partial assistant text when streaming is stopped", () => {
  const started = sessionReducer(createEmptySession(), {
    type: "assistant_draft_started",
    id: "draft-1",
    content: "The nucleus",
    artifactId: undefined,
  });
  const stopped = sessionReducer(started, { type: "assistant_draft_stopped", id: "draft-1" });

  expect(stopped.messages[0]).toMatchObject({
    content: "The nucleus",
    status: "stopped",
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
npm run test -- tests/stream-protocol.test.ts tests/session-reducer.test.ts
```

Expected: FAIL because the protocol helper and reducer actions are missing.

- [ ] **Step 4: Implement stream protocol**

Create `lib/agent/streamProtocol.ts`:

```ts
import type { ArtifactCommand, ArtifactRecord } from "@/lib/artifacts/artifactTypes";

export type AgentStreamEvent =
  | { type: "status"; message: string }
  | { type: "delta"; delta: string }
  | { type: "done"; message: string; trace: string[]; artifact: ArtifactRecord | null; commands: ArtifactCommand[]; error: string | null }
  | { type: "error"; message: string };

export function encodeAgentStreamEvent(event: AgentStreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function decodeAgentStreamEvents(chunk: string): AgentStreamEvent[] {
  return chunk
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const dataLine = block.split("\n").find((line) => line.startsWith("data: "));
      if (!dataLine) throw new Error("Missing stream event data line.");
      return JSON.parse(dataLine.slice("data: ".length)) as AgentStreamEvent;
    });
}
```

- [ ] **Step 5: Add optional message status**

In `lib/artifacts/artifactTypes.ts`, update `chatMessageSchema`:

```ts
export const chatMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  createdAt: z.string().min(1),
  artifactId: z.string().optional(),
  status: z.enum(["streaming", "complete", "stopped"]).optional(),
});
```

This optional field is client-visible and safe for old persisted messages because it is not required.

- [ ] **Step 6: Add draft reducer actions**

In `lib/session/sessionReducer.ts`, extend `SessionAction`:

```ts
| { type: "assistant_draft_started"; id: string; content: string; artifactId?: string }
| { type: "assistant_draft_replaced"; id: string; content: string }
| { type: "assistant_draft_delta"; id: string; delta: string }
| { type: "assistant_draft_completed"; id: string; content: string; artifactId?: string }
| { type: "assistant_draft_stopped"; id: string }
| { type: "artifact_attached_to_message"; id: string; artifact: ArtifactRecord; trace: string[]; content: string }
```

Add helper functions above `sessionReducer()`:

```ts
function draftMessage(id: string, content: string, artifactId?: string): ChatMessage {
  return {
    id,
    role: "assistant",
    content,
    createdAt: now(),
    artifactId,
    status: "streaming",
  };
}

function updateMessage(state: LearningSession, id: string, update: (message: ChatMessage) => ChatMessage): LearningSession {
  return {
    ...state,
    messages: state.messages.map((existing) => (existing.id === id ? update(existing) : existing)),
  };
}
```

Add reducer cases:

```ts
case "assistant_draft_started":
  return { ...state, messages: [...state.messages, draftMessage(action.id, action.content, action.artifactId)] };
case "assistant_draft_replaced":
  return updateMessage(state, action.id, (existing) => ({ ...existing, content: action.content, status: "streaming" }));
case "assistant_draft_delta":
  return updateMessage(state, action.id, (existing) => ({ ...existing, content: `${existing.content}${action.delta}`, status: "streaming" }));
case "assistant_draft_completed":
  return updateMessage(state, action.id, (existing) => ({
    ...existing,
    content: action.content,
    artifactId: action.artifactId ?? existing.artifactId,
    status: "complete",
  }));
case "assistant_draft_stopped":
  return updateMessage(state, action.id, (existing) => ({ ...existing, status: "stopped" }));
case "artifact_attached_to_message":
  return {
    ...state,
    artifacts: { ...state.artifacts, [action.artifact.id]: action.artifact },
    lastArtifactId: action.artifact.id,
    trace: action.trace,
    messages: state.messages.map((existing) =>
      existing.id === action.id
        ? { ...existing, content: action.content, artifactId: action.artifact.id, status: "complete" }
        : existing,
    ),
  };
```

- [ ] **Step 7: Run protocol and reducer tests**

Run:

```bash
npm run test -- tests/stream-protocol.test.ts tests/session-reducer.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit stream protocol and reducer work**

```bash
git add lib/agent/streamProtocol.ts lib/artifacts/artifactTypes.ts lib/session/sessionReducer.ts tests/stream-protocol.test.ts tests/session-reducer.test.ts
git commit -m "feat: support streaming assistant drafts"
```

## Task 3: Streaming Agent API

**Files:**
- Modify: `lib/agent/routes.ts`
- Modify: `app/api/agent/route.ts`
- Modify: `tests/agent-routes.test.ts`

- [ ] **Step 1: Write failing streaming route tests**

Add to `tests/agent-routes.test.ts` imports:

```ts
import { RunItemStreamEvent, RunRawModelStreamEvent } from "@openai/agents";
import type { AgentStreamEvent } from "@/lib/agent/streamProtocol";
```

Update the dynamic import:

```ts
const { handleAgentRoute, handleAgentRouteStream, handleChatRoute } = await import("@/lib/agent/routes");
```

Add helper functions near the artifact fixture:

```ts
function streamedRun(finalOutput: string, deltas: string[]) {
  return {
    finalOutput,
    completed: Promise.resolve(),
    async *[Symbol.asyncIterator]() {
      for (const delta of deltas) {
        yield new RunRawModelStreamEvent({ type: "output_text_delta", delta });
      }
    },
  } as Awaited<ReturnType<typeof run>>;
}

function streamedToolRun(finalOutput: string, deltas: string[]) {
  return {
    finalOutput,
    completed: Promise.resolve(),
    async *[Symbol.asyncIterator]() {
      yield new RunItemStreamEvent("tool_called", { rawItem: { type: "function_call", name: "create_experience" } } as never);
      for (const delta of deltas) {
        yield new RunRawModelStreamEvent({ type: "output_text_delta", delta });
      }
    },
  } as Awaited<ReturnType<typeof run>>;
}

async function collectStream(input: unknown): Promise<AgentStreamEvent[]> {
  const events: AgentStreamEvent[] = [];
  await handleAgentRouteStream(input, (event) => {
    events.push(event);
  });
  return events;
}
```

Add tests:

```ts
it("streams normal chat status, token deltas, and done payload", async () => {
  mockedRun.mockResolvedValueOnce(streamedRun("Cells store energy.", ["Cells ", "store ", "energy."]));

  const events = await collectStream({ mode: "chat", message: "Teach me cells", messages: [] });

  expect(events[0]).toEqual({ type: "status", message: "Let me think this through..." });
  expect(events.filter((event) => event.type === "delta")).toEqual([
    { type: "delta", delta: "Cells " },
    { type: "delta", delta: "store " },
    { type: "delta", delta: "energy." },
  ]);
  expect(events.at(-1)).toMatchObject({ type: "done", message: "Cells store energy.", artifact: null, error: null });
});

it("streams room-building statuses when create_experience is called", async () => {
  createExperienceState.result = { ok: true, artifact };
  mockedRun.mockResolvedValueOnce(streamedToolRun("I built a guided cell room.", []));

  const events = await collectStream({ mode: "chat", message: "Build a cell room", messages: [] });

  expect(events).toContainEqual({ type: "status", message: "I'm sketching the room..." });
  expect(events).toContainEqual({ type: "status", message: "Building the 3D scene..." });
  expect(events).toContainEqual({ type: "status", message: "Checking the lesson..." });
  expect(events.at(-1)).toMatchObject({ type: "done", message: "I built a guided cell room.", artifact, error: null });
});

it("streams learning-room tutor responses and commands", async () => {
  mockedRun.mockResolvedValueOnce(streamedRun("The membrane controls entry.", ["The membrane ", "controls entry."]));

  const events = await collectStream({
    mode: "learning_room",
    message: "What does the membrane do?",
    artifact,
    messages: [],
    selectedComponent: { artifactId: artifact.id, id: "membrane", label: "Cell membrane" },
    activeStepId: "intro",
  });

  expect(events[0]).toEqual({ type: "status", message: "Let me think this through..." });
  expect(events.at(-1)).toMatchObject({
    type: "done",
    message: "The membrane controls entry.",
    artifact: null,
    commands: [],
    error: null,
  });
});
```

- [ ] **Step 2: Run streaming route tests to verify failure**

Run: `npm run test -- tests/agent-routes.test.ts`

Expected: FAIL because `handleAgentRouteStream` does not exist.

- [ ] **Step 3: Implement streaming route helpers**

In `lib/agent/routes.ts`, import:

```ts
import type { RunStreamEvent } from "@openai/agents";
import type { AgentStreamEvent } from "./streamProtocol";
```

Add helper types and functions near `recentConversation()`:

```ts
type EmitAgentStreamEvent = (event: AgentStreamEvent) => void | Promise<void>;

function isTextDelta(event: RunStreamEvent): event is RunStreamEvent & { data: { type: "output_text_delta"; delta: string } } {
  return event.type === "raw_model_stream_event" && event.data.type === "output_text_delta";
}

function isCreateExperienceToolCall(event: RunStreamEvent): boolean {
  const rawItem = event.type === "run_item_stream_event" && event.name === "tool_called" ? event.item.rawItem : null;
  return Boolean(rawItem && rawItem.type === "function_call" && rawItem.name === "create_experience");
}

async function streamRunText(stream: Awaited<ReturnType<typeof run>>, emit: EmitAgentStreamEvent, options?: { roomStatuses?: boolean }) {
  let emittedRoomStatuses = false;
  for await (const event of stream as AsyncIterable<RunStreamEvent>) {
    if (options?.roomStatuses && !emittedRoomStatuses && isCreateExperienceToolCall(event)) {
      emittedRoomStatuses = true;
      await emit({ type: "status", message: "I'm sketching the room..." });
      await emit({ type: "status", message: "Building the 3D scene..." });
      await emit({ type: "status", message: "Checking the lesson..." });
      continue;
    }
    if (isTextDelta(event)) {
      await emit({ type: "delta", delta: event.data.delta });
    }
  }
  await stream.completed;
}
```

Add streaming handlers that mirror the JSON handlers:

```ts
async function handleChatModeStream(request: z.infer<typeof chatAgentRequestSchema>, emit: EmitAgentStreamEvent, signal?: AbortSignal) {
  await emit({ type: "status", message: "Let me think this through..." });
  const userMessage = makeMessage("user", request.message);
  const createExperience = makeCreateExperienceToolSink();
  const researchStemTopic = makeResearchStemTopicTool();
  const agent = makeParallaxAgent([researchStemTopic, createExperience.tool]);
  const history = recentConversation(request.messages);
  const prompt = `Mode: main chat\n${history ? `Conversation so far:\n${history}\n\n` : ""}User request:\n${request.message}`;
  const result = await run(agent, prompt, { maxTurns: 8, stream: true, signal });

  await streamRunText(result, emit, { roomStatuses: true });
  const artifactResult = createExperience.getResult();

  if (!artifactResult) {
    const assistantMessage = makeMessage(
      "assistant",
      finalOutputText(result.finalOutput, "I can help you learn STEM topics or build an interactive 3D experience."),
    );
    await persistIfThreaded(request.userId, request.threadId, [userMessage, assistantMessage]);
    await emit({ type: "done", message: assistantMessage.content, trace: [], artifact: null, commands: [], error: null });
    return;
  }

  const trace = ["Planning learning experience", "Generating interactive 3D artifact", "Validating artifact contract"];
  if (!artifactResult.ok) {
    await emit({ type: "done", message: artifactResult.error, trace, artifact: null, commands: [], error: artifactResult.error });
    return;
  }

  const messageText = finalOutputText(result.finalOutput, `I built ${artifactResult.artifact.title}.`);
  const assistantMessage = makeMessage("assistant", messageText, artifactResult.artifact.id);
  await persistIfThreaded(request.userId, request.threadId, [userMessage, assistantMessage], artifactResult.artifact);
  await emit({ type: "done", message: messageText, trace, artifact: artifactResult.artifact, commands: [], error: null });
}
```

Add learning-room streaming:

```ts
async function handleLearningRoomModeStream(request: z.infer<typeof learningRoomAgentRequestSchema>, emit: EmitAgentStreamEvent, signal?: AbortSignal) {
  await emit({ type: "status", message: "Let me think this through..." });
  const userMessage = makeMessage("user", request.message, request.artifact.id);
  const commandSink = makeSendArtifactCommandSink();
  const agent = makeParallaxAgent([commandSink.tool]);
  const activeStep = request.artifact.walkthroughSteps.find((step) => step.id === request.activeStepId) ?? null;
  const context = {
    mode: "learning_room",
    artifact: {
      title: request.artifact.title,
      topic: request.artifact.topic,
      summary: request.artifact.summary,
      walkthroughSteps: request.artifact.walkthroughSteps,
      components: request.artifact.components,
    },
    selectedComponent: request.selectedComponent,
    activeStep,
    conversation: recentConversation(request.messages),
  };

  const result = await run(agent, `Context:\n${JSON.stringify(context)}\n\nUser question:\n${request.message}`, { maxTurns: 6, stream: true, signal });
  await streamRunText(result, emit);
  const message = finalOutputText(result.finalOutput, "I can help with this artifact.");
  const commands = commandSink.getCommands();

  await persistIfThreaded(request.userId, request.threadId, [
    userMessage,
    makeMessage("assistant", message, request.artifact.id),
  ]);

  await emit({ type: "done", message, trace: [], artifact: null, commands, error: null });
}
```

Export:

```ts
export async function handleAgentRouteStream(input: unknown, emit: EmitAgentStreamEvent, signal?: AbortSignal) {
  requireOpenAiKey();
  const request = agentRouteRequestSchema.parse(input);

  if (request.mode === "chat") {
    await handleChatModeStream(request, emit, signal);
    return;
  }

  await handleLearningRoomModeStream(request, emit, signal);
}
```

- [ ] **Step 4: Add streaming HTTP response**

In `app/api/agent/route.ts`, import:

```ts
import { encodeAgentStreamEvent } from "@/lib/agent/streamProtocol";
import { handleAgentRoute, handleAgentRouteStream } from "@/lib/agent/routes";
```

Replace `POST` with:

```ts
export async function POST(request: Request) {
  const body = await request.json();
  const wantsStream = request.headers.get("accept")?.includes("text/event-stream");

  if (!wantsStream) {
    try {
      const result = await handleAgentRoute(body);
      return NextResponse.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown agent error";
      return NextResponse.json({ message, trace: [], artifact: null, commands: [], error: message }, { status: 500 });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        await handleAgentRouteStream(
          body,
          (event) => controller.enqueue(encoder.encode(encodeAgentStreamEvent(event))),
          request.signal,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown agent error";
        controller.enqueue(encoder.encode(encodeAgentStreamEvent({ type: "error", message })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 5: Run agent route tests**

Run: `npm run test -- tests/agent-routes.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit streaming API**

```bash
git add app/api/agent/route.ts lib/agent/routes.ts tests/agent-routes.test.ts
git commit -m "feat: stream agent responses"
```

## Task 4: Client Streaming, Stop, And Composer Controls

**Files:**
- Modify: `components/chat/ChatComposer.tsx`
- Modify: `components/chat/ChatThread.tsx`
- Modify: `components/app/ParallaxArtifactApp.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Update `ChatComposer` API**

Modify `components/chat/ChatComposer.tsx` props:

```ts
type ChatComposerProps = {
  disabled?: boolean;
  pending?: boolean;
  placeholder: string;
  onSubmit: (message: string) => void;
  onStop?: () => void;
};
```

Change the component signature:

```ts
export function ChatComposer({ disabled = false, pending = false, placeholder, onSubmit, onStop }: ChatComposerProps) {
```

Import `Square`:

```ts
import { SendHorizontal, Square } from "lucide-react";
```

Replace the button block:

```tsx
{pending ? (
  <button className="icon-button stop-button" type="button" onClick={onStop} aria-label="Stop response">
    <Square size={15} />
  </button>
) : (
  <button className="icon-button send-button" type="submit" disabled={disabled || !value.trim()} aria-label="Send message">
    <SendHorizontal size={18} />
  </button>
)}
```

Keep the textarea disabled while `disabled || pending` is true.

- [ ] **Step 2: Add streaming display to `ChatThread`**

In `components/chat/ChatThread.tsx`, add a prop:

```ts
proposalMode?: "full" | "compact";
```

Default to `"full"`.

Update artifact card rendering:

```tsx
{artifact && showArtifactCards ? (
  <ExperienceProposalCard artifact={artifact} trace={trace} onEnterExperience={onEnterExperience} mode={proposalMode} />
) : null}
```

Inside `.message-bubble`, after the paragraph:

```tsx
{message.status === "streaming" ? <span className="streaming-cursor" aria-label="Streaming response" /> : null}
{message.status === "stopped" ? <span className="message-status">Stopped</span> : null}
```

- [ ] **Step 3: Add client stream reader helpers in `ParallaxArtifactApp`**

In `components/app/ParallaxArtifactApp.tsx`, import:

```ts
import { decodeAgentStreamEvents, type AgentStreamEvent } from "@/lib/agent/streamProtocol";
```

Add state:

```ts
const [pendingRequest, setPendingRequest] = useState<AbortController | null>(null);
const busy = Boolean(pendingRequest);
```

Remove the old `const [busy, setBusy] = useState(false);`.

Add helper:

```ts
function makeDraftId() {
  return `message-${crypto.randomUUID()}`;
}
```

Add a shared stream function inside the component:

```ts
async function postAgentStream(body: Record<string, unknown>, draftId: string, artifactId?: string) {
  const controller = new AbortController();
  setPendingRequest(controller);
  let hasDelta = false;

  try {
    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok || !response.body) throw new Error(response.statusText || "Agent stream failed");

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const boundary = buffer.lastIndexOf("\n\n");
      if (boundary === -1) continue;

      const ready = buffer.slice(0, boundary + 2);
      buffer = buffer.slice(boundary + 2);

      for (const event of decodeAgentStreamEvents(ready)) {
        applyStreamEvent(event, draftId, artifactId, hasDelta);
        if (event.type === "delta") hasDelta = true;
      }
    }
  } catch (error) {
    if (controller.signal.aborted) {
      dispatch({ type: "assistant_draft_stopped", id: draftId });
    } else {
      dispatch({ type: "system_event", content: error instanceof Error ? error.message : "Unknown agent error", artifactId });
    }
  } finally {
    setPendingRequest((current) => (current === controller ? null : current));
  }
}
```

Add the event applier:

```ts
function applyStreamEvent(event: AgentStreamEvent, draftId: string, artifactId: string | undefined, hasDelta: boolean) {
  if (event.type === "status" && !hasDelta) {
    dispatch({ type: "assistant_draft_replaced", id: draftId, content: event.message });
    return;
  }
  if (event.type === "delta") {
    dispatch(hasDelta
      ? { type: "assistant_draft_delta", id: draftId, delta: event.delta }
      : { type: "assistant_draft_replaced", id: draftId, content: event.delta });
    return;
  }
  if (event.type === "error") {
    dispatch({ type: "system_event", content: event.message, artifactId });
    return;
  }
  if (event.type === "done") {
    if (event.artifact) {
      dispatch({ type: "artifact_attached_to_message", id: draftId, artifact: event.artifact, trace: event.trace, content: event.message });
    } else {
      dispatch({ type: "assistant_draft_completed", id: draftId, content: event.message, artifactId });
    }
    if (event.commands.length) dispatch({ type: "enqueue_commands", commands: event.commands });
    if (event.error) dispatch({ type: "system_event", content: event.error, artifactId });
  }
}
```

- [ ] **Step 4: Replace JSON send handlers with stream handlers**

Update `sendChatMessage()`:

```ts
async function sendChatMessage(message: string) {
  dispatch({ type: "user_message", content: message });
  const draftId = makeDraftId();
  dispatch({ type: "assistant_draft_started", id: draftId, content: "Let me think this through..." });
  await postAgentStream({ mode: "chat", threadId: activeThreadId, userId, message, messages: state.messages }, draftId);
}
```

Update `sendLearningRoomMessage()`:

```ts
async function sendLearningRoomMessage(message: string) {
  if (!activeArtifact) return;
  dispatch({ type: "user_message", content: message });
  const draftId = makeDraftId();
  dispatch({ type: "assistant_draft_started", id: draftId, content: "Let me think this through...", artifactId: activeArtifact.id });
  await postAgentStream({
    mode: "learning_room",
    threadId: activeThreadId,
    userId,
    message,
    artifact: activeArtifact,
    messages: state.messages,
    selectedComponent: state.selectedComponent,
    activeStepId: state.activeStepId,
  }, draftId, activeArtifact.id);
}
```

Add stop handler:

```ts
function stopResponse() {
  pendingRequest?.abort();
}
```

Pass `pending={busy}` and `onStop={stopResponse}` to every `ChatComposer`.

- [ ] **Step 5: Add streaming CSS**

In `app/globals.css`, add:

```css
.streaming-cursor {
  width: 7px;
  height: 14px;
  display: inline-block;
  margin-left: 3px;
  border-right: 2px solid var(--green);
  animation: cursor-blink 900ms steps(2, start) infinite;
  vertical-align: -2px;
}

.message-status {
  display: inline-flex;
  margin-top: 7px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
}

.stop-button {
  background: #fff0ed;
  color: var(--red);
}

@keyframes cursor-blink {
  50% {
    opacity: 0;
  }
}
```

- [ ] **Step 6: Run client compile verification**

Run:

```bash
npm run test -- tests/session-reducer.test.ts tests/stream-protocol.test.ts
npm run build
```

Expected: both commands PASS.

- [ ] **Step 7: Commit client streaming**

```bash
git add components/app/ParallaxArtifactApp.tsx components/chat/ChatComposer.tsx components/chat/ChatThread.tsx app/globals.css
git commit -m "feat: stream chat responses in the client"
```

## Task 5: Chat-First Main Layout And Slim Thread Rail

**Files:**
- Create: `components/app/ChatHome.tsx`
- Modify: `components/app/ParallaxArtifactApp.tsx`
- Modify: `components/chat/ThreadSidebar.tsx`
- Modify: `components/chat/ExperienceProposalCard.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Create `ChatHome` component**

Create `components/app/ChatHome.tsx`:

```tsx
"use client";

import type { ArtifactRecord, ChatMessage } from "@/lib/artifacts/artifactTypes";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatThread } from "@/components/chat/ChatThread";

const STARTER_PROMPTS = [
  "Show me how a jet engine works",
  "Help me understand photosynthesis",
  "Build a 3D model of an atom",
  "Explain how neural signals travel",
];

type ChatHomeProps = {
  messages: ChatMessage[];
  artifacts: Record<string, ArtifactRecord>;
  trace: string[];
  busy: boolean;
  onSendMessage: (message: string) => void;
  onStop: () => void;
  onEnterExperience: (artifactId: string) => void;
};

export function ChatHome({ messages, artifacts, trace, busy, onSendMessage, onStop, onEnterExperience }: ChatHomeProps) {
  const isEmpty = messages.length === 0;

  return (
    <section className="chat-home-shell" aria-label="Parallax chat">
      <div className="chat-scroll-region">
        <ChatThread messages={messages} artifacts={artifacts} trace={trace} onEnterExperience={onEnterExperience} />
      </div>
      <div className="chat-composer-region">
        {isEmpty ? (
          <div className="starter-prompts" aria-label="Starter prompts">
            {STARTER_PROMPTS.map((prompt) => (
              <button className="prompt-chip" key={prompt} type="button" onClick={() => onSendMessage(prompt)} disabled={busy}>
                {prompt}
              </button>
            ))}
          </div>
        ) : null}
        <ChatComposer
          disabled={busy}
          pending={busy}
          placeholder="Ask Parallax to explain or build a 3D learning room"
          onSubmit={onSendMessage}
          onStop={onStop}
        />
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Simplify `ExperienceProposalCard`**

Modify props:

```ts
type ExperienceProposalCardProps = {
  artifact: ArtifactRecord;
  trace: string[];
  onEnterExperience: (artifactId: string) => void;
  mode?: "full" | "compact";
};
```

Import helper:

```ts
import { learningOutcomesForArtifact } from "@/lib/artifacts/proposalCopy";
```

Implement compact first:

```tsx
export function ExperienceProposalCard({ artifact, onEnterExperience, mode = "full" }: ExperienceProposalCardProps) {
  const outcomes = learningOutcomesForArtifact(artifact);

  if (mode === "compact") {
    return (
      <article className="proposal-row">
        <div>
          <p className="eyebrow">Room created</p>
          <strong>{artifact.title}</strong>
        </div>
        <button className="primary-action" onClick={() => onEnterExperience(artifact.id)}>
          Open <ArrowRight size={16} />
        </button>
      </article>
    );
  }

  return (
    <article className="proposal-card">
      <div className="proposal-head">
        <div>
          <p className="eyebrow">Experience ready</p>
          <h2>{artifact.title}</h2>
        </div>
        <button className="primary-action" onClick={() => onEnterExperience(artifact.id)}>
          Start learning <ArrowRight size={16} />
        </button>
      </div>
      <p className="proposal-summary">{artifact.summary}</p>
      <section className="outcome-panel">
        <h3>
          <ListChecks size={15} /> Things you will explore
        </h3>
        <ul className="outcome-list">
          {outcomes.map((outcome) => (
            <li key={outcome}>{outcome}</li>
          ))}
        </ul>
      </section>
    </article>
  );
}
```

Remove component chips, walkthrough details, and trace row from the full card.

- [ ] **Step 3: Implement thread rail props**

Modify `components/chat/ThreadSidebar.tsx` props:

```ts
type ThreadSidebarProps = {
  threads: PersistedThreadSummary[];
  activeThreadId: string | null;
  pinned: boolean;
  mobileOpen: boolean;
  onTogglePinned: () => void;
  onCloseMobile: () => void;
  onCreateThread: () => void;
  onSelectThread: (threadId: string) => void;
  onArchiveThread: (threadId: string) => void;
};
```

Import icons:

```ts
import { Archive, PanelLeftClose, PanelLeftOpen, MessageSquarePlus } from "lucide-react";
```

Use this root:

```tsx
<aside className={["thread-sidebar", pinned ? "is-pinned" : "", mobileOpen ? "is-mobile-open" : ""].filter(Boolean).join(" ")}>
```

Header:

```tsx
<header>
  <button className="rail-mark" type="button" onClick={onTogglePinned} aria-label={pinned ? "Collapse sidebar" : "Pin sidebar open"} title={pinned ? "Collapse sidebar" : "Pin sidebar open"}>
    {pinned ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
  </button>
  <div className="rail-title">
    <div className="lab-mark">Parallax</div>
  </div>
  <button className="icon-button new-chat-button" type="button" onClick={onCreateThread} aria-label="New chat" title="New chat">
    <MessageSquarePlus size={18} />
  </button>
</header>
```

Keep the thread list, but wrap title/date in `.thread-labels` so CSS can hide them in slim state.

- [ ] **Step 4: Wire `ChatHome` and sidebar state in app**

In `components/app/ParallaxArtifactApp.tsx`:

Import `ChatHome` and remove dashboard-only icons/components:

```ts
import { ChatHome } from "./ChatHome";
```

Add state:

```ts
const [sidebarPinned, setSidebarPinned] = useState(false);
const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
```

Create sidebar once:

```tsx
const sidebar = (
  <ThreadSidebar
    threads={threads}
    activeThreadId={activeThreadId}
    pinned={sidebarPinned}
    mobileOpen={mobileSidebarOpen}
    onTogglePinned={() => setSidebarPinned((current) => !current)}
    onCloseMobile={() => setMobileSidebarOpen(false)}
    onCreateThread={() => void createThread()}
    onSelectThread={(threadId) => void selectThread(threadId)}
    onArchiveThread={(threadId) => void archiveThread(threadId)}
  />
);
```

Replace the non-learning return with:

```tsx
return (
  <main className={sidebarPinned ? "app-shell sidebar-pinned" : "app-shell"}>
    {sidebar}
    <ChatHome
      messages={state.messages}
      artifacts={state.artifacts}
      trace={state.trace}
      busy={busy}
      onSendMessage={sendChatMessage}
      onStop={stopResponse}
      onEnterExperience={enterExperience}
    />
  </main>
);
```

- [ ] **Step 5: Replace dashboard CSS with chat-first shell CSS**

In `app/globals.css`, remove or stop using `.console-main`, `.console-grid`, `.hero-panel`, `.right-rail`, `.metric-panel`, `.dashboard-panel` for the main app.

Add:

```css
.app-shell {
  --rail-width: 58px;
  --sidebar-width: 280px;
  height: 100vh;
  min-height: 0;
  display: grid;
  grid-template-columns: var(--rail-width) minmax(0, 1fr);
  background: var(--bg);
  overflow: hidden;
  transition: grid-template-columns 160ms ease;
}

.app-shell:has(.thread-sidebar:hover),
.app-shell.sidebar-pinned {
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
}

.thread-sidebar {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
  padding: 10px;
  border-right: 1px solid var(--ink);
  background: var(--panel);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.thread-sidebar header {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) 36px;
  gap: 8px;
  align-items: center;
}

.rail-title,
.thread-labels {
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;
}

.thread-sidebar:hover .rail-title,
.thread-sidebar:hover .thread-labels,
.thread-sidebar.is-pinned .rail-title,
.thread-sidebar.is-pinned .thread-labels {
  opacity: 1;
  pointer-events: auto;
}

.chat-home-shell {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  padding: 16px clamp(14px, 4vw, 48px);
}

.chat-scroll-region {
  min-height: 0;
  overflow: auto;
  display: grid;
}

.chat-composer-region {
  width: min(860px, 100%);
  justify-self: center;
  display: grid;
  gap: 10px;
  padding-top: 12px;
}

.starter-prompts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
```

- [ ] **Step 6: Run build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 7: Commit chat-first layout**

```bash
git add components/app/ChatHome.tsx components/app/ParallaxArtifactApp.tsx components/chat/ExperienceProposalCard.tsx components/chat/ThreadSidebar.tsx app/globals.css
git commit -m "feat: reset main layout to chat first"
```

## Task 6: Focused Learning Room

**Files:**
- Create: `components/experience/WalkthroughStrip.tsx`
- Modify: `components/experience/LearningRoom.tsx`
- Modify: `components/experience/ArtifactFrame.tsx`
- Modify: `components/app/ParallaxArtifactApp.tsx`
- Modify: `lib/session/sessionReducer.ts`
- Modify: `tests/session-reducer.test.ts`
- Modify: `app/globals.css`

- [ ] **Step 1: Create walkthrough strip**

Create `components/experience/WalkthroughStrip.tsx`:

```tsx
"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { WalkthroughStep } from "@/lib/artifacts/artifactTypes";

type WalkthroughStripProps = {
  steps: WalkthroughStep[];
  activeStepId: string | null;
  onPrevious: () => void;
  onNext: () => void;
};

export function WalkthroughStrip({ steps, activeStepId, onPrevious, onNext }: WalkthroughStripProps) {
  const activeIndex = Math.max(0, steps.findIndex((step) => step.id === activeStepId));
  const activeStep = steps[activeIndex] ?? steps[0];

  if (!activeStep) return null;

  return (
    <section className="walkthrough-strip" aria-label="Walkthrough">
      <button className="icon-button" type="button" onClick={onPrevious} disabled={activeIndex <= 0} aria-label="Previous step">
        <ChevronLeft size={18} />
      </button>
      <div>
        <p className="eyebrow">Step {activeIndex + 1} of {steps.length}</p>
        <h2>{activeStep.title}</h2>
        <p>{activeStep.narration}</p>
      </div>
      <button className="icon-button" type="button" onClick={onNext} disabled={activeIndex >= steps.length - 1} aria-label="Next step">
        <ChevronRight size={18} />
      </button>
    </section>
  );
}
```

- [ ] **Step 2: Add parent command callbacks**

In `components/app/ParallaxArtifactApp.tsx`, add:

```ts
function goToWalkthroughOffset(offset: number) {
  if (!activeArtifact) return;
  const currentIndex = Math.max(0, activeArtifact.walkthroughSteps.findIndex((step) => step.id === state.activeStepId));
  const nextStep = activeArtifact.walkthroughSteps[Math.max(0, Math.min(activeArtifact.walkthroughSteps.length - 1, currentIndex + offset))];
  if (!nextStep) return;
  dispatch({ type: "step_changed", stepId: nextStep.id, title: nextStep.title });
  dispatch({ type: "enqueue_commands", commands: [{ type: "go_to_step", stepId: nextStep.id }] });
}
```

Pass to `LearningRoom`:

```tsx
onPreviousStep={() => goToWalkthroughOffset(-1)}
onNextStep={() => goToWalkthroughOffset(1)}
```

- [ ] **Step 3: Simplify `ArtifactFrame` toolbar**

Add prop:

```ts
showToolbar?: boolean;
```

Default it:

```ts
showToolbar = false,
```

Wrap the header and code inspector so normal learning mode hides technical controls:

```tsx
{showToolbar ? (
  <header className="artifact-toolbar">
    <div>
      <p className="eyebrow">Learning room</p>
      <h2>{artifact.title}</h2>
    </div>
    <div className="toolbar-actions">
      <button onClick={() => setInspecting(true)}>
        <FileCode size={16} /> Inspect
      </button>
      <button onClick={downloadHtml}>
        <Download size={16} /> Download
      </button>
    </div>
  </header>
) : null}
<iframe ref={iframeRef} title={artifact.title} srcDoc={artifact.html} sandbox="allow-scripts" />
{showToolbar ? <CodeInspector title={artifact.title} html={artifact.html} open={inspecting} onClose={() => setInspecting(false)} /> : null}
```

- [ ] **Step 4: Remove visible chat noise from selection and step events**

Update `tests/session-reducer.test.ts` so component and step events update state without adding chat noise:

```ts
it("tracks selected components without adding visible chat noise", () => {
  const inRoom = sessionReducer(
    sessionReducer(createEmptySession(), { type: "artifact_created", artifact, trace: [] }),
    { type: "enter_experience", artifactId: artifact.id },
  );

  const selected = sessionReducer(inRoom, {
    type: "component_selected",
    component: { artifactId: artifact.id, id: "nucleus", label: "Nucleus", metadata: { role: "DNA store" } },
  });

  expect(selected.selectedComponent).toMatchObject({ id: "nucleus", label: "Nucleus" });
  expect(selected.messages).toHaveLength(inRoom.messages.length);
});

it("tracks walkthrough step changes without adding visible chat noise", () => {
  const inRoom = sessionReducer(
    sessionReducer(createEmptySession(), { type: "artifact_created", artifact, trace: [] }),
    { type: "enter_experience", artifactId: artifact.id },
  );

  const next = sessionReducer(inRoom, { type: "step_changed", stepId: "intro", title: "Start" });

  expect(next.activeStepId).toBe("intro");
  expect(next.messages).toHaveLength(inRoom.messages.length);
});
```

Update `lib/session/sessionReducer.ts` cases:

```ts
case "component_selected":
  return {
    ...state,
    selectedComponent: action.component,
  };
case "step_changed":
  return {
    ...state,
    activeStepId: action.stepId,
  };
```

Run: `npm run test -- tests/session-reducer.test.ts`

Expected: PASS after updating the existing selected-component test expectation.

- [ ] **Step 5: Replace learning room side panels**

Modify `components/experience/LearningRoom.tsx` props:

```ts
activeStepId: string | null;
onPreviousStep: () => void;
onNextStep: () => void;
```

Import:

```ts
import { WalkthroughStrip } from "./WalkthroughStrip";
```

Remove imports for `Braces`, `CheckCircle2`, `Crosshair`, `ListChecks`, and `RotateCcw`.

Set `roomMessages` to the full thread history:

```ts
const roomMessages = messages;
```

Replace the main layout body with:

```tsx
<section className="learning-room-shell">
  <div className="learning-canvas-area">
    <ArtifactFrame
      artifact={artifact}
      pendingCommands={pendingCommands}
      onCommandsFlushed={onCommandsFlushed}
      onComponentSelected={onComponentSelected}
      onStepChanged={onStepChanged}
      onArtifactError={onArtifactError}
    />
    <WalkthroughStrip
      steps={artifact.walkthroughSteps}
      activeStepId={activeStepId}
      onPrevious={onPreviousStep}
      onNext={onNextStep}
    />
  </div>

  <aside className="room-chat">
    <header>
      <div>
        <p className="eyebrow">
          <MessageSquare size={14} /> Tutor
        </p>
        <h2>{artifact.topic}</h2>
      </div>
      <div className="toolbar-actions">
        <button className="icon-button" onClick={onExit} aria-label="Exit experience" title="Exit experience">
          <LogOut size={18} />
        </button>
      </div>
    </header>
    {selectedComponent ? <div className="selected-chip">Selected: {selectedComponent.label}</div> : null}
    <ChatThread messages={roomMessages} artifacts={artifacts} trace={trace} onEnterExperience={onEnterExperience} proposalMode="compact" />
    <ChatComposer disabled={busy} pending={busy} placeholder="Ask about this room" onSubmit={onLearningRoomMessage} onStop={onStop} />
  </aside>
</section>
```

Add `onStop` prop to `LearningRoomProps` and pass it from `ParallaxArtifactApp`.

- [ ] **Step 6: Render learning room inside shared shell**

In `ParallaxArtifactApp`, replace the learning-room early return with the same app shell used for chat:

```tsx
if (state.mode === "learning_room" && activeArtifact) {
  return (
    <main className={sidebarPinned ? "app-shell sidebar-pinned is-learning" : "app-shell is-learning"}>
      {sidebar}
      <LearningRoom
        artifact={activeArtifact}
        messages={state.messages}
        artifacts={state.artifacts}
        trace={state.trace}
        pendingCommands={state.pendingCommands}
        selectedComponent={state.selectedComponent}
        activeStepId={state.activeStepId}
        busy={busy}
        onExit={() => dispatch({ type: "exit_experience" })}
        onStop={stopResponse}
        onResetSession={resetSession}
        onLearningRoomMessage={sendLearningRoomMessage}
        onCommandsFlushed={() => dispatch({ type: "clear_pending_commands" })}
        onComponentSelected={selectComponent}
        onStepChanged={(stepId, title) => dispatch({ type: "step_changed", stepId, title })}
        onPreviousStep={() => goToWalkthroughOffset(-1)}
        onNextStep={() => goToWalkthroughOffset(1)}
        onArtifactError={(message) => dispatch({ type: "artifact_error", message })}
        onEnterExperience={enterExperience}
      />
    </main>
  );
}
```

- [ ] **Step 7: Add focused learning room CSS**

In `app/globals.css`, replace the old `.learning-room`, `.room-main`, `.inspector-panel`, and `.command-log` normal layout with:

```css
.learning-room-shell {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(320px, 28vw, 420px);
  gap: 12px;
  padding: 12px;
  overflow: hidden;
}

.learning-canvas-area {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 10px;
}

.artifact-stage {
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--ink);
  border-radius: 6px;
  background: var(--dark);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.artifact-stage iframe {
  width: 100%;
  height: 100%;
  border: 0;
  background: var(--dark);
}

.walkthrough-strip {
  min-width: 0;
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 32px;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--ink);
  border-radius: 6px;
  background: var(--panel);
  padding: 10px;
  box-shadow: var(--shadow);
}

.walkthrough-strip h2,
.walkthrough-strip p {
  margin: 0;
  overflow-wrap: anywhere;
}

.selected-chip {
  width: fit-content;
  max-width: 100%;
  border: 1px solid var(--ink);
  border-radius: 999px;
  background: var(--accent);
  padding: 6px 9px;
  font-size: 11px;
  font-weight: 900;
  overflow-wrap: anywhere;
}
```

- [ ] **Step 8: Run build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 9: Commit focused learning room**

```bash
git add components/app/ParallaxArtifactApp.tsx components/experience/ArtifactFrame.tsx components/experience/LearningRoom.tsx components/experience/WalkthroughStrip.tsx lib/session/sessionReducer.ts tests/session-reducer.test.ts app/globals.css
git commit -m "feat: focus the learning room layout"
```

## Task 7: Responsive Drawer And Visual Verification

**Files:**
- Modify: `components/app/ParallaxArtifactApp.tsx`
- Modify: `components/chat/ThreadSidebar.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Add mobile drawer controls**

In `ParallaxArtifactApp`, import `Menu` from `lucide-react`.

Add a mobile button before `ChatHome` and before `LearningRoom` content:

```tsx
<button className="mobile-sidebar-button icon-button" type="button" onClick={() => setMobileSidebarOpen(true)} aria-label="Open chats">
  <Menu size={18} />
</button>
```

In `ThreadSidebar`, call `onCloseMobile()` after selecting a thread on mobile:

```tsx
onClick={() => {
  onSelectThread(thread.id);
  onCloseMobile();
}}
```

- [ ] **Step 2: Add responsive CSS**

In `app/globals.css`, add:

```css
.mobile-sidebar-button {
  display: none;
  position: fixed;
  top: 10px;
  left: 10px;
  z-index: 30;
}

@media (max-width: 760px) {
  html,
  body {
    height: auto;
    min-height: 100%;
    overflow: auto;
  }

  .app-shell,
  .app-shell.sidebar-pinned,
  .app-shell:has(.thread-sidebar:hover) {
    min-height: 100vh;
    height: auto;
    display: block;
    overflow: visible;
  }

  .mobile-sidebar-button {
    display: inline-flex;
  }

  .thread-sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    width: min(300px, calc(100vw - 32px));
    transform: translateX(-105%);
    transition: transform 160ms ease;
    z-index: 40;
  }

  .thread-sidebar.is-mobile-open {
    transform: translateX(0);
  }

  .rail-title,
  .thread-labels {
    opacity: 1;
    pointer-events: auto;
  }

  .chat-home-shell {
    min-height: 100vh;
    padding: 54px 12px 12px;
  }

  .starter-prompts {
    grid-template-columns: 1fr;
  }

  .learning-room-shell {
    min-height: 100vh;
    grid-template-columns: 1fr;
    padding: 54px 10px 10px;
    overflow: visible;
  }

  .learning-canvas-area {
    min-height: 70vh;
  }

  .room-chat {
    min-height: 60vh;
  }
}
```

- [ ] **Step 3: Run full automated verification**

Run:

```bash
npm run test
npm run build
```

Expected: PASS for both commands.

- [ ] **Step 4: Start local dev server**

Run:

```bash
npm run dev
```

Expected: Next dev server starts on `http://localhost:3000` or another printed available port.

- [ ] **Step 5: Browser verification**

Use the in-app Browser or Vercel agent-browser skill to inspect:

- Desktop main chat at `http://localhost:3000`.
- Mobile viewport around `390x844`.
- Main empty state shows starter prompts only when there are no messages.
- Sidebar is slim by default on desktop.
- Hover expands the sidebar and pushes the chat panel sideways.
- Pin button keeps it expanded.
- Mobile shows a menu button and opens the thread drawer.
- Entering a learning room shows left rail, center canvas, walkthrough strip below, and tutor chat right.
- Mobile learning room stacks canvas, walkthrough, then tutor chat.

- [ ] **Step 6: Stop dev server**

Stop the dev server process cleanly with `Ctrl-C`.

- [ ] **Step 7: Commit responsive polish**

```bash
git add components/app/ParallaxArtifactApp.tsx components/chat/ThreadSidebar.tsx app/globals.css
git commit -m "feat: add responsive chat rail behavior"
```

## Final Verification

- [ ] **Step 1: Check there are no conflict markers or CSS syntax drift**

```bash
rg -n "^(<<<<<<<|=======|>>>>>>>)" .
git diff --check
```

Expected: `rg` prints no matches and `git diff --check` exits 0.

- [ ] **Step 2: Run full tests and build**

```bash
npm run test
npm run build
```

Expected: all Vitest tests pass and Next production build completes.

- [ ] **Step 3: Review final diff**

```bash
git status --short
git diff --stat
```

Expected: only intentional files are changed; no generated `.next` files are staged.

- [ ] **Step 4: Create final commit if previous tasks were not committed individually**

```bash
git add app components lib tests package.json package-lock.json
git commit -m "feat: simplify Parallax chat experience"
```

Expected: commit succeeds. Skip this step if every task already has its own commit.

## Plan Self-Review

- Main chat layout, bottom composer, empty-state starter prompts, and removal of dashboard panels are covered by Task 5.
- Slim-by-default sidebar, hover expansion, pinning, pushed layout, and mobile drawer behavior are covered by Tasks 5 and 7.
- Proposal-first flow, simple preview-rich proposal cards, compact room rows, and friendly learning outcomes are covered by Tasks 1 and 5.
- Token streaming, immediate teacherly status text, room-generation status steps, and Stop behavior are covered by Tasks 2, 3, and 4.
- Learning room canvas-center layout, full-history tutor chat, selected component chip, walkthrough strip below canvas, and removal of inspector/command panels are covered by Task 6.
- Responsive mobile stacking and browser visual checks are covered by Task 7.
- Persistence compatibility is covered by Tasks 1, 2, and 3 through optional schema fields and existing JSON fallback behavior.
