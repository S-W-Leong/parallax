import { run } from "@openai/agents";
import { z } from "zod";
import {
  artifactRecordSchema,
  chatMessageSchema,
  selectedComponentSchema,
  type ArtifactCommand,
  type ArtifactRecord,
  type ChatMessage,
} from "@/lib/artifacts/artifactTypes";
import { getThreadStore } from "@/lib/cloud/threadStore";
import { encodeAgentStreamEvent, type AgentStreamEvent } from "./streamProtocol";
import { makeBuilderAgent, makePlannerAgent, makeTutorAgent } from "./agents";
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

function makeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown agent error";
}

function streamStatusForMode(mode: "chat" | "learning_room" | unknown): string {
  return mode === "learning_room" ? "Thinking..." : "Planning the lesson...";
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
  const plannerPrompt = `Mode: chat
${history ? `Recent conversation:\n${history}\n\n` : ""}User request:\n${request.message}`;

  return { userMessage, lessonPlan, createExperience, plannerAgent, builderAgent, plannerPrompt };
}

function makeBuilderPrompt(plan: LessonPlan, requestMessage: string): string {
  return `Lesson plan:\n${JSON.stringify(plan)}\n\nOriginal user request:\n${requestMessage}`;
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
) {
  const artifactResult = createExperience.getResult();
  const trace = plan ? makeChatArtifactTrace(plan) : [];

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

  const messageText = finalOutputText(result.finalOutput, `I built ${artifactResult.artifact.title}.`);
  const assistantMessage = makeMessage("assistant", messageText, artifactResult.artifact.id);
  await persistIfThreaded(request.userId, request.threadId, [userMessage, assistantMessage], artifactResult.artifact);
  return {
    message: messageText,
    trace,
    artifact: artifactResult.artifact,
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
  return finishChatMode(request, prepared.userMessage, builderResult, prepared.createExperience, planned.plan);
}

function prepareLearningRoomMode(request: z.infer<typeof learningRoomAgentRequestSchema>) {
  const userMessage = makeMessage("user", request.message, request.artifact.id);
  const commandSink = makeSendArtifactCommandSink();
  const agent = makeTutorAgent([commandSink.tool]);
  const activeStep = request.artifact.walkthroughSteps.find((step) => step.id === request.activeStepId) ?? null;
  const context = {
    mode: "learning_room",
    artifact: {
      title: request.artifact.title,
      topic: request.artifact.topic,
      summary: request.artifact.summary,
      lessonMode: request.artifact.lessonMode,
      interactionGoal: request.artifact.interactionGoal,
      controls: request.artifact.controls ?? [],
      sources: request.artifact.sources ?? [],
      walkthroughSteps: request.artifact.walkthroughSteps,
      components: request.artifact.components,
    },
    selectedComponent: request.selectedComponent,
    activeStep,
    conversation: recentConversation(request.messages),
  };
  const prompt = `Context:\n${JSON.stringify(context)}\n\nUser question:\n${request.message}`;

  return { userMessage, commandSink, agent, prompt };
}

async function finishLearningRoomMode(
  request: z.infer<typeof learningRoomAgentRequestSchema>,
  userMessage: ChatMessage,
  result: { finalOutput?: unknown },
  commandSink: ReturnType<typeof makeSendArtifactCommandSink>,
) {
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
  return finishLearningRoomMode(request, prepared.userMessage, result, prepared.commandSink);
}

function extractDeltaFromStreamEvent(event: unknown): string | null {
  if (typeof event === "string") return event;
  if (!event || typeof event !== "object") return null;

  const data = "data" in event ? (event as { data?: unknown }).data : event;
  if (!data || typeof data !== "object") return null;

  const delta = (data as { delta?: unknown }).delta;
  if (typeof delta === "string") return delta;

  const text = (data as { text?: unknown }).text;
  return typeof text === "string" ? text : null;
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

async function emitRunDeltas(streamedResult: unknown, emit: (event: AgentStreamEvent) => void) {
  const toTextStream = (streamedResult as { toTextStream?: () => unknown }).toTextStream;
  if (typeof toTextStream === "function") {
    for await (const delta of readTextChunks(toTextStream.call(streamedResult))) {
      emit({ type: "delta", delta });
    }
    return;
  }

  if (typeof (streamedResult as AsyncIterable<unknown>)?.[Symbol.asyncIterator] === "function") {
    for await (const event of streamedResult as AsyncIterable<unknown>) {
      const delta = extractDeltaFromStreamEvent(event);
      if (delta) emit({ type: "delta", delta });
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
  emit({ type: "status", message: "Planning the lesson..." });
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
  await emitRunDeltas(result, emit);
  await waitForStreamCompletion(result);
  return finishChatMode(request, prepared.userMessage, result, prepared.createExperience, planned.plan);
}

async function runLearningRoomModeStream(
  request: z.infer<typeof learningRoomAgentRequestSchema>,
  emit: (event: AgentStreamEvent) => void,
  signal: AbortSignal,
) {
  const prepared = prepareLearningRoomMode(request);
  const result = await run(prepared.agent, prepared.prompt, { maxTurns: 6, stream: true, signal });
  await emitRunDeltas(result, emit);
  await waitForStreamCompletion(result);
  return finishLearningRoomMode(request, prepared.userMessage, result, prepared.commandSink);
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
