import { tool, type Tool } from "@openai/agents";
import { z } from "zod";
import { researchStemTopic } from "../exa";

const researchStemTopicInputSchema = z.object({
  query: z.string().min(1),
});

export function makeResearchStemTopicTool(): Tool {
  return tool({
    name: "research_stem_topic",
    description:
      "Optionally retrieve concise source snippets for niche, current, advanced, or accuracy-sensitive STEM topics. Continue without sources if unavailable.",
    parameters: researchStemTopicInputSchema,
    async execute(input) {
      if (!process.env.EXA_API_KEY) {
        return {
          ok: true,
          sources: [],
          note: "EXA_API_KEY is not configured; continue from model knowledge.",
        };
      }

      const sources = await researchStemTopic(input.query);
      return {
        ok: true,
        sources,
        note: sources.length ? "Use these sources for factual grounding." : "No Exa sources returned; continue from model knowledge.",
      };
    },
  });
}
