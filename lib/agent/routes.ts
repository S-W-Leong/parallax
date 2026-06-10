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
import { makeGuideAgent } from "./agents";
import { ThreadAgentSession } from "./threadAgentSession";
import { makeBuildLearningArtifactToolSink } from "./tools/buildLearningArtifactTool";
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

function activeArtifactForGuide(request: z.infer<typeof agentRouteRequestSchema>): ArtifactRecord | null {
  if (request.mode === "learning_room") return request.artifact;
  return latestArtifactForChat(request);
}

function activeStepForGuide(request: z.infer<typeof agentRouteRequestSchema>, artifact: ArtifactRecord | null) {
  if (request.mode !== "learning_room" || !artifact) return null;
  return artifact.walkthroughSteps.find((step) => step.id === request.activeStepId) ?? null;
}

function artifactGuidePayload(artifact: ArtifactRecord) {
  return {
    ...promptArtifactPayload(artifact),
    lessonMode: artifact.lessonMode,
    interactionGoal: artifact.interactionGoal,
    controls: artifact.controls ?? [],
    sources: artifact.sources ?? [],
  };
}

function makeGuidePrompt(request: z.infer<typeof agentRouteRequestSchema>, artifact: ArtifactRecord | null): string {
  const context = {
    surface: request.mode,
    visibleArtifact: request.mode === "learning_room" && Boolean(artifact),
    activeArtifact: artifact ? artifactGuidePayload(artifact) : null,
    selectedComponent: request.mode === "learning_room" ? request.selectedComponent : null,
    activeStep: activeStepForGuide(request, artifact),
    lastArtifactId: request.mode === "chat" ? request.lastArtifactId ?? null : artifact?.id ?? null,
  };

  return `Context:\n${JSON.stringify(context)}\n\nUser message:\n${request.message}`;
}

function makeThreadSession(userId: string | undefined, threadId: string | undefined) {
  if (!userId || !threadId) return undefined;
  return new ThreadAgentSession({
    userId,
    threadId,
    store: getThreadStore(),
  });
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
    if (eventType && !eventType.includes("output_text.delta") && eventType !== "text_delta") {
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

async function finishGuideMode(
  request: z.infer<typeof agentRouteRequestSchema>,
  result: { finalOutput?: unknown },
  userMessage: ChatMessage,
  activeArtifact: ArtifactRecord | null,
  buildArtifact: ReturnType<typeof makeBuildLearningArtifactToolSink>,
  commandSink: ReturnType<typeof makeSendArtifactCommandSink>,
): Promise<AgentRouteResult> {
  const artifactResult = buildArtifact.getResult();
  if (artifactResult) {
    if (!artifactResult.ok) {
      const assistantMessage = makeMessage("assistant", artifactResult.message, activeArtifact?.id);
      await persistIfThreaded(request.userId, request.threadId, [userMessage, assistantMessage]);
      return {
        message: artifactResult.message,
        trace: artifactResult.trace,
        artifact: null,
        commands: [],
        error: artifactResult.error,
      };
    }

    const message = finalOutputText(result.finalOutput, artifactResult.message);
    const assistantMessage = makeMessage("assistant", message, artifactResult.artifact.id);
    await persistIfThreaded(request.userId, request.threadId, [userMessage, assistantMessage], artifactResult.artifact);
    return {
      message,
      trace: artifactResult.trace,
      artifact: artifactResult.artifact,
      commands: commandSink.getCommands(),
      error: null,
    };
  }

  const message = finalOutputText(result.finalOutput, "I can help you learn STEM topics or build an interactive 3D experience.");
  const assistantMessage = makeMessage("assistant", message, activeArtifact?.id);
  await persistIfThreaded(request.userId, request.threadId, [userMessage, assistantMessage]);
  return {
    message,
    trace: [],
    artifact: null,
    commands: commandSink.getCommands(),
    error: null,
  };
}

async function handleGuideMode(request: z.infer<typeof agentRouteRequestSchema>, signal?: AbortSignal) {
  const activeArtifact = activeArtifactForGuide(request);
  const userMessage = makeMessage("user", request.message, activeArtifact?.id);
  const buildArtifact = makeBuildLearningArtifactToolSink();
  const commandSink = makeSendArtifactCommandSink();
  const tools = activeArtifact
    ? [makeResearchStemTopicTool(), buildArtifact.tool, commandSink.tool]
    : [makeResearchStemTopicTool(), buildArtifact.tool];
  const guideAgent = makeGuideAgent(tools);
  const result = await run(guideAgent, makeGuidePrompt(request, activeArtifact), {
    maxTurns: 8,
    signal,
    session: makeThreadSession(request.userId, request.threadId),
  });

  return finishGuideMode(request, result, userMessage, activeArtifact, buildArtifact, commandSink);
}

async function runGuideModeStream(
  request: z.infer<typeof agentRouteRequestSchema>,
  emit: (event: AgentStreamEvent) => void,
  signal: AbortSignal,
) {
  const activeArtifact = activeArtifactForGuide(request);
  const userMessage = makeMessage("user", request.message, activeArtifact?.id);
  const buildArtifact = makeBuildLearningArtifactToolSink();
  const commandSink = makeSendArtifactCommandSink();
  const tools = activeArtifact
    ? [makeResearchStemTopicTool(), buildArtifact.tool, commandSink.tool]
    : [makeResearchStemTopicTool(), buildArtifact.tool];
  const guideAgent = makeGuideAgent(tools);
  const result = await run(guideAgent, makeGuidePrompt(request, activeArtifact), {
    maxTurns: 8,
    stream: true,
    signal,
    session: makeThreadSession(request.userId, request.threadId),
  });
  await emitRunStreamEvents(result, emit);
  await waitForStreamCompletion(result);
  return finishGuideMode(request, result, userMessage, activeArtifact, buildArtifact, commandSink);
}

export async function handleAgentRoute(input: unknown) {
  requireOpenAiKey();
  const request = agentRouteRequestSchema.parse(input);

  return handleGuideMode(request);
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

      emit({ type: "status", message: streamStatusForMode((input as { mode?: unknown } | null)?.mode) });

      void (async () => {
        try {
          requireOpenAiKey();
          const request = agentRouteRequestSchema.parse(input);
          const result = await runGuideModeStream(request, emit, abortController.signal);
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
