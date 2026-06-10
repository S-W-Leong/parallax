import { tool, type Tool } from "@openai/agents";
import { z } from "zod";

const artifactCritiqueToolInputSchema = z.object({
  approved: z.boolean(),
  factualIssues: z.array(z.string().min(1)).max(8),
  visualIssues: z.array(z.string().min(1)).max(8),
  interactionIssues: z.array(z.string().min(1)).max(8),
  missingComponents: z.array(z.string().min(1)).max(8),
  repairInstructions: z.string().min(1).nullable(),
}).superRefine((value, ctx) => {
  if (!value.approved && value.repairInstructions == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["repairInstructions"],
      message: "Blocked artifacts require repair instructions.",
    });
  }
});

export type ArtifactCritique = {
  approved: boolean;
  factualIssues: string[];
  visualIssues: string[];
  interactionIssues: string[];
  missingComponents: string[];
  repairInstructions?: string;
};

export type ArtifactCritiqueToolSink = {
  tool: Tool;
  getResult: () => ArtifactCritique | null;
};

function normalizeToolInput(input: z.infer<typeof artifactCritiqueToolInputSchema>): ArtifactCritique {
  return {
    approved: input.approved,
    factualIssues: input.factualIssues,
    visualIssues: input.visualIssues,
    interactionIssues: input.interactionIssues,
    missingComponents: input.missingComponents,
    repairInstructions: input.repairInstructions ?? undefined,
  };
}

export function makeArtifactCritiqueToolSink(): ArtifactCritiqueToolSink {
  let result: ArtifactCritique | null = null;

  const critiqueTool = tool({
    name: "critique_artifact",
    description:
      "Record whether a generated 3D learning artifact is accurate, realistic, and pedagogically safe to show.",
    parameters: artifactCritiqueToolInputSchema,
    async execute(input) {
      result = normalizeToolInput(input);
      const issueCount = result.factualIssues.length
        + result.visualIssues.length
        + result.interactionIssues.length
        + result.missingComponents.length;

      return {
        ok: true,
        approved: result.approved,
        issueCount,
      };
    },
  });

  return {
    tool: critiqueTool,
    getResult: () => result,
  };
}
