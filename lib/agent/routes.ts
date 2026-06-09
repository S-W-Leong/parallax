import { run } from "@openai/agents";
import { z } from "zod";
import { artifactRecordSchema, chatMessageSchema, selectedComponentSchema, type ChatMessage } from "@/lib/artifacts/artifactTypes";
import { makeOrchestratorAgent, makeTutorAgent } from "./agents";
import { makeCreateExperienceToolSink } from "./tools/createExperienceTool";
import { makeSendArtifactCommandSink } from "./tools/sendArtifactCommandTool";

export const chatRouteRequestSchema = z.object({
  message: z.string().min(1),
  messages: z.array(chatMessageSchema).default([]),
});

export const tutorRouteRequestSchema = z.object({
  message: z.string().min(1),
  artifact: artifactRecordSchema,
  messages: z.array(chatMessageSchema).default([]),
  selectedComponent: selectedComponentSchema.nullable(),
  activeStepId: z.string().nullable(),
});

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

function recentConversation(messages: ChatMessage[]): string {
  return messages
    .slice(-10)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");
}

export async function handleChatRoute(input: unknown) {
  requireOpenAiKey();
  const request = chatRouteRequestSchema.parse(input);
  const createExperience = makeCreateExperienceToolSink();
  const agent = makeOrchestratorAgent([createExperience.tool]);
  const history = recentConversation(request.messages);
  const prompt = `${history ? `Conversation so far:\n${history}\n\n` : ""}User request:\n${request.message}`;

  const result = await run(agent, prompt, { maxTurns: 8 });
  const artifactResult = createExperience.getResult();
  const trace = ["Planning learning experience", "Generating interactive 3D artifact", "Validating artifact contract"];

  if (!artifactResult) {
    return {
      message: "The agent did not call create_experience.",
      trace,
      artifact: null,
      error: "The agent did not call create_experience.",
    };
  }

  if (!artifactResult.ok) {
    return {
      message: artifactResult.error,
      trace,
      artifact: null,
      error: artifactResult.error,
    };
  }

  return {
    message: finalOutputText(result.finalOutput, `I built ${artifactResult.artifact.title}.`),
    trace,
    artifact: artifactResult.artifact,
    error: null,
  };
}

export async function handleTutorRoute(input: unknown) {
  requireOpenAiKey();
  const request = tutorRouteRequestSchema.parse(input);
  const commandSink = makeSendArtifactCommandSink();
  const agent = makeTutorAgent([commandSink.tool]);
  const activeStep = request.artifact.walkthroughSteps.find((step) => step.id === request.activeStepId) ?? null;
  const context = {
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

  return {
    message: finalOutputText(result.finalOutput, "I can help with this artifact."),
    commands: commandSink.getCommands(),
  };
}
