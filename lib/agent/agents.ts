import { Agent, type Tool } from "@openai/agents";
import { ORCHESTRATOR_PROMPT, TUTOR_PROMPT } from "./prompts";

const model = process.env.OPENAI_MODEL ?? "gpt-5.4";

export function makeOrchestratorAgent(tools: Tool[]) {
  return new Agent({
    name: "Parallax Orchestrator",
    model,
    instructions: ORCHESTRATOR_PROMPT,
    tools,
  });
}

export function makeTutorAgent(tools: Tool[]) {
  return new Agent({
    name: "Parallax Tutor",
    model,
    instructions: TUTOR_PROMPT,
    tools,
  });
}
