import { tool, type Tool } from "@openai/agents";
import { z } from "zod";
import { createArtifactRecord, type CreateArtifactRecordResult } from "@/lib/artifacts/artifactValidator";
import {
  artifactSourceSchema,
  lessonModeSchema,
  type CreateExperienceInput,
} from "@/lib/artifacts/artifactTypes";

const vector3Schema = z.array(z.number()).min(3).max(3);

const artifactControlToolInputSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["range", "toggle"]),
  label: z.string().min(1),
  min: z.number().nullable(),
  max: z.number().nullable(),
  step: z.number().positive().nullable(),
  value: z.number().nullable(),
  enabled: z.boolean().nullable(),
}).superRefine((control, ctx) => {
  if (control.type === "range") {
    if (control.min == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["min"], message: "Range controls require min." });
    }
    if (control.max == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["max"], message: "Range controls require max." });
    }
    if (control.step == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["step"], message: "Range controls require step." });
    }
    if (control.value == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "Range controls require value." });
    }
  }

  if (control.type === "toggle" && control.enabled == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["enabled"], message: "Toggle controls require enabled." });
  }
});

const createExperienceToolInputSchema = z.object({
  topic: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  lessonMode: lessonModeSchema.default("guided_walkthrough"),
  interactionGoal: z.string().min(1).nullable().optional(),
  sources: z.array(artifactSourceSchema).max(4).nullable().optional(),
  controls: z.array(artifactControlToolInputSchema).max(6).nullable().optional(),
  learningOutcomes: z.array(z.string().min(1).max(96)).min(1).max(3).nullable().optional(),
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
  })),
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

  function controls(value: z.infer<typeof artifactControlToolInputSchema>[] | null | undefined): CreateExperienceInput["controls"] {
    return value?.map((control) => {
      if (control.type === "toggle") {
        return {
          id: control.id,
          type: "toggle",
          label: control.label,
          value: Boolean(control.enabled),
        };
      }

      return {
        id: control.id,
        type: "range",
        label: control.label,
        min: control.min ?? 0,
        max: control.max ?? 1,
        step: control.step ?? 1,
        value: control.value ?? 0,
      };
    });
  }

  return {
    ...input,
    interactionGoal: input.interactionGoal ?? undefined,
    sources: input.sources ?? undefined,
    controls: controls(input.controls),
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
