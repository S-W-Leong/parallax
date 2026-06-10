import { tool, type Tool } from "@openai/agents";
import { z } from "zod";
import { createArtifactRecord, type CreateArtifactRecordResult } from "@/lib/artifacts/artifactValidator";
import type { CreateExperienceInput } from "@/lib/artifacts/artifactTypes";

const vector3Schema = z.array(z.number()).min(3).max(3);

const createExperienceToolInputSchema = z.object({
  topic: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  learningOutcomes: z.array(z.string().min(1).max(96)).min(1).max(3).nullable(),
  sceneSource: z.string().min(1),
  components: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    description: z.string().nullable(),
    metadata: z.string().nullable(),
  })).min(3),
  walkthroughSteps: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    narration: z.string().min(1),
    targetComponentIds: z.array(z.string().min(1)),
    camera: z.object({
      position: vector3Schema.nullable(),
      lookAt: vector3Schema.nullable(),
    }).nullable(),
  })).min(1),
});

function normalizeToolInput(input: z.infer<typeof createExperienceToolInputSchema>): CreateExperienceInput {
  function vector(value: number[] | null): [number, number, number] | undefined {
    return value ? [value[0], value[1], value[2]] : undefined;
  }

  function metadata(value: string | null): Record<string, unknown> | undefined {
    if (!value) return undefined;
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : { note: value };
    } catch {
      return { note: value };
    }
  }

  return {
    ...input,
    learningOutcomes: input.learningOutcomes ?? undefined,
    components: input.components.map((component) => ({
      id: component.id,
      label: component.label,
      description: component.description ?? undefined,
      metadata: metadata(component.metadata),
    })),
    walkthroughSteps: input.walkthroughSteps.map((step) => ({
      id: step.id,
      title: step.title,
      narration: step.narration,
      targetComponentIds: step.targetComponentIds,
      camera: step.camera
        ? {
            position: vector(step.camera.position),
            lookAt: vector(step.camera.lookAt),
          }
        : undefined,
    })),
  };
}

export type CreateExperienceToolSink = {
  tool: Tool;
  getResult: () => CreateArtifactRecordResult | null;
};

export function makeCreateExperienceToolSink(): CreateExperienceToolSink {
  let result: CreateArtifactRecordResult | null = null;

  const createExperienceTool = tool({
    name: "create_experience",
    description:
      "Create the complete interactive Three.js learning artifact. Use this exactly once after planning the best learning experience.",
    parameters: createExperienceToolInputSchema,
    async execute(input) {
      result = createArtifactRecord(normalizeToolInput(input));
      if (!result.ok) {
        return {
          ok: false,
          error: result.error,
        };
      }

      return {
        ok: true,
        artifactId: result.artifact.id,
        title: result.artifact.title,
        componentCount: result.artifact.components.length,
        walkthroughStepCount: result.artifact.walkthroughSteps.length,
      };
    },
  });

  return {
    tool: createExperienceTool,
    getResult: () => result,
  };
}
