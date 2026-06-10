import { run } from "@openai/agents";
import { z } from "zod";
import {
  artifactRecordSchema,
  chatMessageSchema,
  selectedComponentSchema,
  type AgentTraceEntry,
  type ArtifactCommand,
  type ArtifactRecord,
  type ChatMessage,
} from "@/lib/artifacts/artifactTypes";
import { getThreadStore } from "@/lib/cloud/threadStore";
import { encodeAgentStreamEvent, type AgentStreamEvent } from "./streamProtocol";
import { makeBuilderAgent, makeCriticAgent, makePlannerAgent, makeTutorAgent } from "./agents";
import { makeArtifactCritiqueToolSink, type ArtifactCritique } from "./tools/artifactCritiqueTool";
import { makeCreateExperienceToolSink } from "./tools/createExperienceTool";
import { makeLessonPlanToolSink, type LessonPlan } from "./tools/lessonPlanTool";
import { makeResearchStemTopicTool } from "./tools/researchStemTopicTool";
import { makeSendArtifactCommandSink } from "./tools/sendArtifactCommandTool";

const persistedThreadContextSchema = z.object({
  threadId: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
}).superRefine((value, ctx) => {
  if (value.threadId && !value.userId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["userId"],
      message: "userId is required when threadId is provided.",
    });
  }

  if (value.userId && !value.threadId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["threadId"],
      message: "threadId is required when userId is provided.",
    });
  }
});

const chatAgentRequestSchema = z.object({
  mode: z.literal("chat"),
  message: z.string().min(1),
  messages: z.array(chatMessageSchema).default([]),
  artifacts: z.record(z.string(), artifactRecordSchema).default({}),
  activeArtifactId: z.string().nullable().optional(),
  lastArtifactId: z.string().nullable().optional(),
}).merge(persistedThreadContextSchema);

const learningRoomAgentRequestSchema = z.object({
  mode: z.literal("learning_room"),
  message: z.string().min(1),
  artifact: artifactRecordSchema,
  messages: z.array(chatMessageSchema).default([]),
  selectedComponent: selectedComponentSchema.nullable(),
  activeStepId: z.string().nullable(),
}).merge(persistedThreadContextSchema);

export const agentRouteRequestSchema = z.discriminatedUnion("mode", [
  chatAgentRequestSchema,
  learningRoomAgentRequestSchema,
]);

function requireOpenAiKey() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required to run the Parallax Agents SDK harness.");
  }
}

function finalOutputText(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value;
  if (value == null) return fallback;
  return JSON.stringify(value);
}

function makeMessage(role: ChatMessage["role"], content: string, artifactId?: string): ChatMessage {
  return {
    id: `message-${crypto.randomUUID()}`,
    role,
    content,
    createdAt: new Date().toISOString(),
    artifactId,
  };
}

async function persistIfThreaded(userId: string | undefined, threadId: string | undefined, messages: ChatMessage[], artifact?: ArtifactRecord | null) {
  if (!userId || !threadId) return;
  const store = getThreadStore();
  if (!artifact) {
    for (const message of messages) {
      await store.appendMessage(userId, threadId, message);
    }
    return;
  }

  const [userMessage, assistantMessage] = messages;
  if (userMessage) await store.appendMessage(userId, threadId, userMessage);
  await store.saveArtifact(userId, threadId, artifact);
  if (assistantMessage) await store.appendMessage(userId, threadId, assistantMessage);
}

function recentConversation(messages: ChatMessage[]): string {
  return messages
    .slice(-10)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");
}

function promptArtifactPayload(artifact: ArtifactRecord) {
  return {
    id: artifact.id,
    title: artifact.title,
    topic: artifact.topic,
    summary: artifact.summary,
    components: artifact.components,
    walkthroughSteps: artifact.walkthroughSteps,
    sceneSource: artifact.sceneSource,
  };
}

function latestArtifactForChat(request: z.infer<typeof chatAgentRequestSchema>): ArtifactRecord | null {
  const candidates = [
    request.activeArtifactId,
    request.lastArtifactId,
    ...request.messages.slice().reverse().map((message) => message.artifactId),
  ];

  for (const id of candidates) {
    if (id && request.artifacts[id]) return request.artifacts[id];
  }

  return null;
}

function latestArtifactContextForChat(request: z.infer<typeof chatAgentRequestSchema>): string {
  const artifact = latestArtifactForChat(request);
  if (!artifact) return "";

  return `Latest artifact context for rebuild/patch follow-ups:\n${JSON.stringify(promptArtifactPayload(artifact), null, 2)}`;
}

function makeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown agent error";
}

function streamStatusForMode(mode: "chat" | "learning_room" | unknown): string {
  return "Thinking...";
}

type AgentRouteResult = {
  message: string;
  trace?: string[];
  artifact?: ArtifactRecord | null;
  commands?: ArtifactCommand[];
  error?: string | null;
};

function toDoneEvent(result: AgentRouteResult): AgentStreamEvent {
  return {
    type: "done",
    message: result.message,
    trace: result.trace ?? [],
    artifact: result.artifact ?? null,
    commands: result.commands ?? [],
    error: result.error ?? null,
  };
}

function toErrorDoneEvent(error: unknown): AgentStreamEvent {
  const message = makeErrorMessage(error);
  return {
    type: "done",
    message,
    trace: [],
    artifact: null,
    commands: [],
    error: message,
  };
}

function prepareChatMode(request: z.infer<typeof chatAgentRequestSchema>) {
  const userMessage = makeMessage("user", request.message);
  const lessonPlan = makeLessonPlanToolSink();
  const plannerAgent = makePlannerAgent([makeResearchStemTopicTool(), lessonPlan.tool]);
  const createExperience = makeCreateExperienceToolSink();
  const builderAgent = makeBuilderAgent([createExperience.tool]);
  const history = recentConversation(request.messages);
  const artifactContext = latestArtifactContextForChat(request);
  const plannerPrompt = `Mode: chat
${history ? `Recent conversation:\n${history}\n\n` : ""}${artifactContext ? `${artifactContext}\n\n` : ""}User request:\n${request.message}`;

  return { userMessage, lessonPlan, createExperience, plannerAgent, builderAgent, plannerPrompt };
}

function makeBuilderPrompt(
  plan: LessonPlan,
  requestMessage: string,
  feedback?: { critic?: ArtifactCritique; validatorError?: string },
): string {
  const criticFeedback = feedback?.critic
    ? `\n\nCritic feedback from previous attempt:\n${JSON.stringify(feedback.critic, null, 2)}`
    : "";
  const validatorFeedback = feedback?.validatorError
    ? `\n\nValidator feedback from previous attempt:\n${feedback.validatorError}\nRepair the artifact and call create_experience exactly once. Match the selected lessonMode rules exactly.`
    : "";
  return `Lesson plan:\n${JSON.stringify(plan)}\n\nOriginal user request:\n${requestMessage}${criticFeedback}${validatorFeedback}`;
}

function makeChatArtifactTrace(plan: LessonPlan): string[] {
  return [
    "Choosing lesson mode",
    plan.researchUsed ? "Grounding lesson plan with Exa" : "Skipping research for stable topic",
    `Selected ${plan.lessonMode ?? "unknown"} lesson mode`,
    "Generating interactive 3D artifact",
    "Validating artifact contract",
  ];
}

function makeCriticPrompt(plan: LessonPlan, artifact: ArtifactRecord, requestMessage: string): string {
  const artifactForReview = {
    id: artifact.id,
    title: artifact.title,
    topic: artifact.topic,
    summary: artifact.summary,
    lessonMode: artifact.lessonMode,
    interactionGoal: artifact.interactionGoal,
    sources: artifact.sources ?? [],
    controls: artifact.controls ?? [],
    components: artifact.components,
    walkthroughSteps: artifact.walkthroughSteps,
    sceneSource: artifact.sceneSource,
  };

  return `Lesson plan:\n${JSON.stringify(plan, null, 2)}\n\nOriginal user request:\n${requestMessage}\n\nArtifact to review:\n${JSON.stringify(artifactForReview, null, 2)}`;
}

async function critiqueArtifact(plan: LessonPlan, artifact: ArtifactRecord, requestMessage: string) {
  const critiqueSink = makeArtifactCritiqueToolSink();
  const criticAgent = makeCriticAgent([critiqueSink.tool]);
  await run(criticAgent, makeCriticPrompt(plan, artifact, requestMessage), { maxTurns: 4 });

  const critique = critiqueSink.getResult();
  if (!critique) {
    return {
      ok: false as const,
      error: "The artifact critic did not call critique_artifact.",
    };
  }

  return {
    ok: true as const,
    critique,
  };
}

function critiqueIssueSummary(critique: ArtifactCritique): string {
  return [
    ...critique.factualIssues,
    ...critique.visualIssues,
    ...critique.interactionIssues,
    ...critique.missingComponents.map((component) => `Missing component: ${component}`),
  ].join(" ");
}

function blockedArtifactMessage(title: string, critique: ArtifactCritique): string {
  const issueSummary = critiqueIssueSummary(critique);
  const repair = critique.repairInstructions ? `Repair guidance: ${critique.repairInstructions}` : "";
  const detail = [issueSummary, repair].filter(Boolean).join(" ");
  return `I couldn't generate a reliable artifact for "${title}" yet.${detail ? ` ${detail}` : ""}`;
}

async function finishDirectPlannerAnswer(
  request: z.infer<typeof chatAgentRequestSchema>,
  userMessage: ChatMessage,
  result: { finalOutput?: unknown },
) {
  const assistantMessage = makeMessage(
    "assistant",
    finalOutputText(result.finalOutput, "I can help you learn STEM topics or build an interactive 3D experience."),
  );
  await persistIfThreaded(request.userId, request.threadId, [userMessage, assistantMessage]);
  return {
    message: assistantMessage.content,
    trace: [],
    artifact: null,
    error: null,
  };
}

async function finishArtifactBuildFailure(
  request: z.infer<typeof chatAgentRequestSchema>,
  userMessage: ChatMessage,
  errorMessage: string,
  trace: string[],
) {
  const assistantMessage = makeMessage("assistant", errorMessage);
  await persistIfThreaded(request.userId, request.threadId, [userMessage, assistantMessage]);
  return {
    message: errorMessage,
    trace,
    artifact: null,
    error: errorMessage,
  };
}

function missingCreateExperienceErrorMessage(plan?: LessonPlan): string {
  const title = plan?.title?.trim();
  return title
    ? `The builder did not call create_experience for the planned artifact "${title}".`
    : "The builder did not call create_experience for the planned artifact.";
}

async function finishChatMode(
  request: z.infer<typeof chatAgentRequestSchema>,
  userMessage: ChatMessage,
  result: { finalOutput?: unknown },
  createExperience: ReturnType<typeof makeCreateExperienceToolSink>,
  plan?: LessonPlan,
  builderAgent?: ReturnType<typeof makeBuilderAgent>,
  requestMessage?: string,
) {
  let artifactResult = createExperience.getResult();
  const trace = plan ? makeChatArtifactTrace(plan) : [];

  if ((!artifactResult || !artifactResult.ok) && plan?.artifactNeeded && builderAgent && requestMessage) {
    const validationError = artifactResult?.ok === false
      ? artifactResult.error
      : missingCreateExperienceErrorMessage(plan);
    trace.push("Repairing artifact from validator feedback");
    createExperience.clearResult();
    result = await run(
      builderAgent,
      makeBuilderPrompt(plan, requestMessage, { validatorError: validationError }),
      { maxTurns: 8 },
    );
    artifactResult = createExperience.getResult();
  }

  if (!artifactResult) {
    if (plan?.artifactNeeded) {
      return finishArtifactBuildFailure(
        request,
        userMessage,
        missingCreateExperienceErrorMessage(plan),
        trace,
      );
    }
    return finishDirectPlannerAnswer(request, userMessage, result);
  }

  if (!artifactResult.ok) {
    return finishArtifactBuildFailure(request, userMessage, artifactResult.error, trace);
  }

  let acceptedArtifact = artifactResult.artifact;
  let acceptedResult = result;

  if (plan && builderAgent && requestMessage) {
    trace.push("Reviewing artifact accuracy");
    const critique = await critiqueArtifact(plan, acceptedArtifact, requestMessage);
    if (!critique.ok) {
      return finishArtifactBuildFailure(request, userMessage, critique.error, trace);
    }

    if (!critique.critique.approved) {
      trace.push("Repairing artifact from critic feedback");
      createExperience.clearResult();
      const retryResult = await run(builderAgent, makeBuilderPrompt(plan, requestMessage, { critic: critique.critique }), { maxTurns: 8 });
      const retryArtifactResult = createExperience.getResult();

      if (!retryArtifactResult) {
        return finishArtifactBuildFailure(
          request,
          userMessage,
          missingCreateExperienceErrorMessage(plan),
          trace,
        );
      }

      if (!retryArtifactResult.ok) {
        return finishArtifactBuildFailure(request, userMessage, retryArtifactResult.error, trace);
      }

      trace.push("Re-reviewing artifact accuracy");
      const retryCritique = await critiqueArtifact(plan, retryArtifactResult.artifact, requestMessage);
      if (!retryCritique.ok) {
        return finishArtifactBuildFailure(request, userMessage, retryCritique.error, trace);
      }

      if (!retryCritique.critique.approved) {
        const message = blockedArtifactMessage(retryArtifactResult.artifact.title, retryCritique.critique);
        return finishArtifactBuildFailure(request, userMessage, message, trace);
      }

      acceptedArtifact = retryArtifactResult.artifact;
      acceptedResult = retryResult;
    }
  }

  const messageText = finalOutputText(acceptedResult.finalOutput, `I built ${acceptedArtifact.title}.`);
  const assistantMessage = makeMessage("assistant", messageText, acceptedArtifact.id);
  await persistIfThreaded(request.userId, request.threadId, [userMessage, assistantMessage], acceptedArtifact);
  return {
    message: messageText,
    trace,
    artifact: acceptedArtifact,
    error: null,
  };
}

async function handleChatMode(request: z.infer<typeof chatAgentRequestSchema>) {
  const prepared = prepareChatMode(request);
  const plannerResult = await run(prepared.plannerAgent, prepared.plannerPrompt, { maxTurns: 6 });
  const planned = prepared.lessonPlan.getResult();

  if (!planned?.ok || !planned.plan.artifactNeeded) {
    return finishDirectPlannerAnswer(request, prepared.userMessage, plannerResult);
  }

  const builderResult = await run(prepared.builderAgent, makeBuilderPrompt(planned.plan, request.message), { maxTurns: 8 });
  return finishChatMode(
    request,
    prepared.userMessage,
    builderResult,
    prepared.createExperience,
    planned.plan,
    prepared.builderAgent,
    request.message,
  );
}

function prepareLearningRoomMode(request: z.infer<typeof learningRoomAgentRequestSchema>) {
  const userMessage = makeMessage("user", request.message, request.artifact.id);
  const commandSink = makeSendArtifactCommandSink();
  const createExperience = makeCreateExperienceToolSink();
  const agent = makeTutorAgent([commandSink.tool, createExperience.tool]);
  const activeStep = request.artifact.walkthroughSteps.find((step) => step.id === request.activeStepId) ?? null;
  const context = {
    mode: "learning_room",
    artifact: {
      ...promptArtifactPayload(request.artifact),
      lessonMode: request.artifact.lessonMode,
      interactionGoal: request.artifact.interactionGoal,
      controls: request.artifact.controls ?? [],
      sources: request.artifact.sources ?? [],
    },
    selectedComponent: request.selectedComponent,
    activeStep,
    conversation: recentConversation(request.messages),
  };
  const prompt = `Context:\n${JSON.stringify(context)}\n\nUser question:\n${request.message}`;

  return { userMessage, commandSink, createExperience, agent, prompt };
}

async function finishLearningRoomMode(
  request: z.infer<typeof learningRoomAgentRequestSchema>,
  userMessage: ChatMessage,
  result: { finalOutput?: unknown },
  commandSink: ReturnType<typeof makeSendArtifactCommandSink>,
  createExperience: ReturnType<typeof makeCreateExperienceToolSink>,
) {
  const artifactResult = createExperience.getResult();
  if (artifactResult) {
    const trace = ["Planning replacement scene", "Generating replacement 3D artifact", "Validating artifact contract"];

    if (!artifactResult.ok) {
      return {
        message: artifactResult.error,
        trace,
        artifact: null,
        commands: [],
        error: artifactResult.error,
      };
    }

    const message = finalOutputText(result.finalOutput, `I rebuilt ${artifactResult.artifact.title}.`);
    await persistIfThreaded(request.userId, request.threadId, [
      userMessage,
      makeMessage("assistant", message, artifactResult.artifact.id),
    ], artifactResult.artifact);

    return {
      message,
      trace,
      artifact: artifactResult.artifact,
      commands: [],
      error: null,
    };
  }

  const message = finalOutputText(result.finalOutput, "I can help with this artifact.");
  await persistIfThreaded(request.userId, request.threadId, [
    userMessage,
    makeMessage("assistant", message, request.artifact.id),
  ]);

  return {
    message,
    commands: commandSink.getCommands(),
  };
}

async function handleLearningRoomMode(request: z.infer<typeof learningRoomAgentRequestSchema>) {
  const prepared = prepareLearningRoomMode(request);
  const result = await run(prepared.agent, prepared.prompt, { maxTurns: 6 });
  return finishLearningRoomMode(request, prepared.userMessage, result, prepared.commandSink, prepared.createExperience);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function stringProperty(value: unknown, key: string): string | null {
  if (!isRecord(value)) return null;
  const property = value[key];
  return typeof property === "string" && property ? property : null;
}

function truncateDetail(value: string, maxLength = 180): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}...` : compact;
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function summarizeToolOutput(output: unknown): string | undefined {
  const data = typeof output === "string" ? parseJsonObject(output) : isRecord(output) ? output : null;
  if (!data) {
    return output === undefined || output === null ? undefined : truncateDetail(String(output));
  }

  if (data.ok === false) {
    const error = typeof data.error === "string" ? data.error : "Tool failed";
    return truncateDetail(error);
  }

  if (data.ok === true) {
    const parts: string[] = [];
    if (typeof data.componentCount === "number") {
      parts.push(`${data.componentCount} component${data.componentCount === 1 ? "" : "s"}`);
    }
    if (typeof data.walkthroughStepCount === "number") {
      parts.push(`${data.walkthroughStepCount} step${data.walkthroughStepCount === 1 ? "" : "s"}`);
    }
    return parts.length ? `Succeeded (${parts.join(", ")})` : "Succeeded";
  }

  return truncateDetail(JSON.stringify(data));
}

function streamEventCandidates(event: unknown): unknown[] {
  if (!isRecord(event)) return [event];

  const data = event.data;
  const nestedEvent = isRecord(data) ? data.event : undefined;
  return [event, data, nestedEvent].filter((candidate) => candidate !== undefined);
}

function extractDeltaFromStreamEvent(event: unknown): string | null {
  if (typeof event === "string") return event;

  for (const candidate of streamEventCandidates(event)) {
    if (!isRecord(candidate)) continue;

    const eventType = stringProperty(candidate, "type");
    if (eventType && !eventType.includes("output_text.delta")) {
      continue;
    }

    const delta = stringProperty(candidate, "delta");
    if (delta) return delta;

    const text = stringProperty(candidate, "text");
    if (text) return text;

    const choices = candidate.choices;
    if (Array.isArray(choices)) {
      for (const choice of choices) {
        const content = isRecord(choice) && isRecord(choice.delta) ? stringProperty(choice.delta, "content") : null;
        if (content) return content;
      }
    }
  }

  return null;
}

function toolNameForItem(item: unknown): string {
  return (
    stringProperty(item, "toolName") ??
    stringProperty(item, "name") ??
    (isRecord(item) ? stringProperty(item.rawItem, "name") : null) ??
    "tool"
  );
}

function outputDetailForItem(item: unknown): string | undefined {
  if (!isRecord(item)) return undefined;

  const output = item.output ?? (isRecord(item.rawItem) ? item.rawItem.output : undefined);
  if (output === undefined || output === null) return undefined;

  return summarizeToolOutput(output);
}

function traceEntryFromRunStreamEvent(event: unknown): AgentTraceEntry | null {
  if (!isRecord(event)) return null;

  if (event.type === "agent_updated_stream_event") {
    const agentName = isRecord(event.agent) ? stringProperty(event.agent, "name") : null;
    return { kind: "agent", label: `Using ${agentName ?? "agent"}` };
  }

  if (event.type !== "run_item_stream_event") return null;

  const name = stringProperty(event, "name");
  const item = event.item;
  if (!name) return null;

  if (name === "reasoning_item_created") {
    return { kind: "reasoning", label: "Reasoning through next step" };
  }

  if (name === "tool_called" || name === "tool_search_called") {
    return { kind: "tool", label: `Calling ${toolNameForItem(item)}`, detail: "Executing tool" };
  }

  if (name === "tool_output" || name === "tool_search_output_created") {
    const toolName = toolNameForItem(item);
    return { kind: "tool", label: `${toolName} completed`, detail: outputDetailForItem(item) };
  }

  if (name === "handoff_requested") {
    return { kind: "handoff", label: "Handoff requested" };
  }

  if (name === "handoff_occurred") {
    return { kind: "handoff", label: "Handoff completed" };
  }

  return null;
}

async function* readTextChunks(readable: unknown): AsyncIterable<string> {
  if (!readable) return;

  if (typeof (readable as AsyncIterable<string>)[Symbol.asyncIterator] === "function") {
    for await (const chunk of readable as AsyncIterable<string>) {
      if (typeof chunk === "string" && chunk) yield chunk;
    }
    return;
  }

  if (typeof (readable as ReadableStream<string>).getReader === "function") {
    const reader = (readable as ReadableStream<string>).getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (typeof value === "string" && value) yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }
}

async function emitRunStreamEvents(streamedResult: unknown, emit: (event: AgentStreamEvent) => void) {
  if (typeof (streamedResult as AsyncIterable<unknown>)?.[Symbol.asyncIterator] === "function") {
    for await (const event of streamedResult as AsyncIterable<unknown>) {
      const traceEntry = traceEntryFromRunStreamEvent(event);
      if (traceEntry) emit({ type: "trace", entry: traceEntry });

      const delta = extractDeltaFromStreamEvent(event);
      if (delta) emit({ type: "delta", delta });
    }
    return;
  }

  const toTextStream = (streamedResult as { toTextStream?: () => unknown }).toTextStream;
  if (typeof toTextStream === "function") {
    for await (const delta of readTextChunks(toTextStream.call(streamedResult))) {
      emit({ type: "delta", delta });
    }
  }
}

async function waitForStreamCompletion(streamedResult: unknown) {
  const completed = (streamedResult as { completed?: unknown }).completed;
  if (completed && typeof (completed as Promise<void>).then === "function") {
    await completed;
  }

  const streamError = (streamedResult as { error?: unknown }).error;
  if (streamError) throw streamError;
}

async function runChatModeStream(
  request: z.infer<typeof chatAgentRequestSchema>,
  emit: (event: AgentStreamEvent) => void,
  signal: AbortSignal,
) {
  const prepared = prepareChatMode(request);
  emit({ type: "status", message: "Thinking..." });
  const plannerResult = await run(prepared.plannerAgent, prepared.plannerPrompt, { maxTurns: 6, signal });
  const planned = prepared.lessonPlan.getResult();

  if (!planned?.ok || !planned.plan.artifactNeeded) {
    return finishDirectPlannerAnswer(request, prepared.userMessage, plannerResult);
  }

  emit({
    type: "status",
    message: planned.plan.researchUsed ? "Using grounded sources..." : `Selected ${planned.plan.lessonMode} mode...`,
  });
  emit({ type: "status", message: "Building the interactive artifact..." });
  const result = await run(prepared.builderAgent, makeBuilderPrompt(planned.plan, request.message), {
    maxTurns: 8,
    stream: true,
    signal,
  });
  await emitRunStreamEvents(result, emit);
  await waitForStreamCompletion(result);
  return finishChatMode(
    request,
    prepared.userMessage,
    result,
    prepared.createExperience,
    planned.plan,
    prepared.builderAgent,
    request.message,
  );
}

async function runLearningRoomModeStream(
  request: z.infer<typeof learningRoomAgentRequestSchema>,
  emit: (event: AgentStreamEvent) => void,
  signal: AbortSignal,
) {
  const prepared = prepareLearningRoomMode(request);
  const result = await run(prepared.agent, prepared.prompt, { maxTurns: 6, stream: true, signal });
  await emitRunStreamEvents(result, emit);
  await waitForStreamCompletion(result);
  return finishLearningRoomMode(request, prepared.userMessage, result, prepared.commandSink, prepared.createExperience);
}

export async function handleAgentRoute(input: unknown) {
  requireOpenAiKey();
  const request = agentRouteRequestSchema.parse(input);

  if (request.mode === "chat") {
    return handleChatMode(request);
  }

  return handleLearningRoomMode(request);
}

export function handleAgentRouteStream(input: unknown, options: { signal?: AbortSignal } = {}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const abortController = new AbortController();
  const abort = () => {
    if (!abortController.signal.aborted) {
      abortController.abort();
    }
  };

  if (options.signal?.aborted) {
    abort();
  } else {
    options.signal?.addEventListener("abort", abort, { once: true });
  }
  let canceled = false;

  return new ReadableStream<Uint8Array>({
    cancel() {
      canceled = true;
      abort();
    },
    start(controller) {
      const emit = (event: AgentStreamEvent) => {
        if (canceled || abortController.signal.aborted) return false;
        try {
          controller.enqueue(encoder.encode(encodeAgentStreamEvent(event)));
          return true;
        } catch {
          canceled = true;
          abort();
          return false;
        }
      };
      const close = () => {
        if (canceled) return;
        try {
          controller.close();
        } catch {
          canceled = true;
          abort();
        }
      };

      if ((input as { mode?: unknown } | null)?.mode !== "chat") {
        emit({ type: "status", message: streamStatusForMode((input as { mode?: unknown } | null)?.mode) });
      }

      void (async () => {
        try {
          requireOpenAiKey();
          const request = agentRouteRequestSchema.parse(input);
          const result = request.mode === "chat"
            ? await runChatModeStream(request, emit, abortController.signal)
            : await runLearningRoomModeStream(request, emit, abortController.signal);
          emit(toDoneEvent(result));
        } catch (error) {
          if (!abortController.signal.aborted) {
            const message = makeErrorMessage(error);
            emit({ type: "error", message });
            emit(toErrorDoneEvent(error));
          }
        } finally {
          options.signal?.removeEventListener("abort", abort);
          close();
        }
      })();
    },
  });
}

export async function handleChatRoute(input: unknown) {
  return handleAgentRoute({ ...(input as Record<string, unknown>), mode: "chat" });
}

export async function handleTutorRoute(input: unknown) {
  return handleAgentRoute({ ...(input as Record<string, unknown>), mode: "learning_room" });
}
