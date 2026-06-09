import { run } from "@openai/agents";
import { z } from "zod";
import {
  artifactRecordSchema,
  chatMessageSchema,
  selectedComponentSchema,
  type ArtifactRecord,
  type ChatMessage,
} from "@/lib/artifacts/artifactTypes";
import { getThreadStore } from "@/lib/cloud/threadStore";
import { makeParallaxAgent } from "./agents";
import { makeCreateExperienceToolSink } from "./tools/createExperienceTool";
import { makeResearchStemTopicTool } from "./tools/researchStemTopicTool";
import { makeSendArtifactCommandSink } from "./tools/sendArtifactCommandTool";

const persistedThreadContextSchema = z.object({
  threadId: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
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

async function handleChatMode(request: z.infer<typeof chatAgentRequestSchema>) {
  const userMessage = makeMessage("user", request.message);
  const createExperience = makeCreateExperienceToolSink();
  const researchStemTopic = makeResearchStemTopicTool();
  const agent = makeParallaxAgent([researchStemTopic, createExperience.tool]);
  const history = recentConversation(request.messages);
  const prompt = `Mode: main chat
${history ? `Conversation so far:\n${history}\n\n` : ""}User request:\n${request.message}`;

  const result = await run(agent, prompt, { maxTurns: 8 });
  const artifactResult = createExperience.getResult();

  if (!artifactResult) {
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

  const trace = ["Planning learning experience", "Generating interactive 3D artifact", "Validating artifact contract"];

  if (!artifactResult.ok) {
    return {
      message: artifactResult.error,
      trace,
      artifact: null,
      error: artifactResult.error,
    };
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

async function handleLearningRoomMode(request: z.infer<typeof learningRoomAgentRequestSchema>) {
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

  const result = await run(agent, `Context:\n${JSON.stringify(context)}\n\nUser question:\n${request.message}`, { maxTurns: 6 });

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

export async function handleAgentRoute(input: unknown) {
  requireOpenAiKey();
  const request = agentRouteRequestSchema.parse(input);

  if (request.mode === "chat") {
    return handleChatMode(request);
  }

  return handleLearningRoomMode(request);
}

export async function handleChatRoute(input: unknown) {
  return handleAgentRoute({ ...(input as Record<string, unknown>), mode: "chat" });
}

export async function handleTutorRoute(input: unknown) {
  return handleAgentRoute({ ...(input as Record<string, unknown>), mode: "learning_room" });
}
