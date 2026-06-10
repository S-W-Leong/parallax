import { Agent, type Tool } from "@openai/agents";
import {
  BUILDER_AGENT_PROMPT,
  PARALLAX_AGENT_PROMPT,
  PLANNER_AGENT_PROMPT,
  TUTOR_AGENT_PROMPT,
} from "./prompts";

const model = process.env.OPENAI_MODEL ?? "gpt-5.4";

export function makePlannerAgent(tools: Tool[]) {
  return new Agent({
    name: "Parallax Planner",
    model,
    instructions: PLANNER_AGENT_PROMPT,
    tools,
  });
}

export function makeBuilderAgent(tools: Tool[]) {
  return new Agent({
    name: "Parallax Builder",
    model,
    instructions: BUILDER_AGENT_PROMPT,
    tools,
  });
}

export function makeTutorAgent(tools: Tool[]) {
  return new Agent({
    name: "Parallax Tutor",
    model,
    instructions: TUTOR_AGENT_PROMPT,
    tools,
  });
}

export function makeParallaxAgent(tools: Tool[]) {
  return new Agent({
    name: "Parallax",
    model,
    instructions: PARALLAX_AGENT_PROMPT,
    tools,
  });
}
