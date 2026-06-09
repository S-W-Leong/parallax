import { Agent, type Tool } from "@openai/agents";
import { PARALLAX_AGENT_PROMPT } from "./prompts";

const model = process.env.OPENAI_MODEL ?? "gpt-5.4";

export function makeParallaxAgent(tools: Tool[]) {
  return new Agent({
    name: "Parallax Agent",
    model,
    instructions: PARALLAX_AGENT_PROMPT,
    tools,
  });
}
