import { Agent, type Tool } from "@openai/agents";
import {
  BUILDER_AGENT_PROMPT,
  CRITIC_AGENT_PROMPT,
  GUIDE_AGENT_PROMPT,
} from "./prompts";

const model = process.env.OPENAI_MODEL ?? "gpt-5.4";

export function makeGuideAgent(tools: Tool[]) {
  return new Agent({
    name: "Parallax Guide",
    model,
    instructions: GUIDE_AGENT_PROMPT,
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

export function makeCriticAgent(tools: Tool[]) {
  return new Agent({
    name: "Parallax Artifact Critic",
    model,
    instructions: CRITIC_AGENT_PROMPT,
    tools,
  });
}
