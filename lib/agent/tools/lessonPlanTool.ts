import { tool, type Tool } from "@openai/agents";
import { z } from "zod";
import { artifactSourceSchema, lessonModeSchema } from "@/lib/artifacts/artifactTypes";

export const lessonPlanToolInputSchema = z.object({
  artifactNeeded: z.boolean(),
  lessonMode: lessonModeSchema.nullable(),
  title: z.string().min(1).nullable(),
  topic: z.string().min(1).nullable(),
  rationale: z.string().min(1),
  interactionGoal: z.string().min(1).nullable(),
  researchUsed: z.boolean(),
  sources: z.array(artifactSourceSchema).max(4),
  requiredComponents: z.array(z.string().min(1)).max(8),
  builderBrief: z.string().min(1).nullable(),
}).superRefine((value, ctx) => {
  if (value.artifactNeeded) {
    if (value.lessonMode == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "lessonMode is required when artifactNeeded is true.",
        path: ["lessonMode"],
      });
    }
    if (value.title == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "title is required when artifactNeeded is true.",
        path: ["title"],
      });
    }
    if (value.topic == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "topic is required when artifactNeeded is true.",
        path: ["topic"],
      });
    }
    if (value.interactionGoal == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "interactionGoal is required when artifactNeeded is true.",
        path: ["interactionGoal"],
      });
    }
    if (value.builderBrief == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "builderBrief is required when artifactNeeded is true.",
        path: ["builderBrief"],
      });
    }
    return;
  }

  if (value.lessonMode != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "lessonMode must be omitted when artifactNeeded is false.",
      path: ["lessonMode"],
    });
  }
  if (value.title != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "title must be omitted when artifactNeeded is false.",
      path: ["title"],
    });
  }
  if (value.topic != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "topic must be omitted when artifactNeeded is false.",
      path: ["topic"],
    });
  }
  if (value.interactionGoal != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "interactionGoal must be omitted when artifactNeeded is false.",
      path: ["interactionGoal"],
    });
  }
  if (value.builderBrief != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "builderBrief must be omitted when artifactNeeded is false.",
      path: ["builderBrief"],
    });
  }
  if (value.requiredComponents.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "requiredComponents must be empty when artifactNeeded is false.",
      path: ["requiredComponents"],
    });
  }
  if (value.sources.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "sources are only allowed when artifactNeeded is true.",
      path: ["sources"],
    });
  }
});

export type LessonPlan = {
  artifactNeeded: boolean;
  lessonMode?: z.infer<typeof lessonModeSchema>;
  title?: string;
  topic?: string;
  rationale: string;
  interactionGoal?: string;
  researchUsed: boolean;
  sources: z.infer<typeof artifactSourceSchema>[];
  requiredComponents: string[];
  builderBrief?: string;
};

export type LessonPlanToolResult =
  | { ok: true; plan: LessonPlan }
  | { ok: false; error: string };

export type LessonPlanToolSink = {
  tool: Tool;
  getResult: () => LessonPlanToolResult | null;
};

function normalizeNullable<T>(value: T | null): T | undefined {
  return value ?? undefined;
}

function normalizeToolInput(input: z.infer<typeof lessonPlanToolInputSchema>): LessonPlan {
  return {
    artifactNeeded: input.artifactNeeded,
    lessonMode: normalizeNullable(input.lessonMode),
    title: normalizeNullable(input.title),
    topic: normalizeNullable(input.topic),
    rationale: input.rationale,
    interactionGoal: normalizeNullable(input.interactionGoal),
    researchUsed: input.researchUsed,
    sources: input.sources,
    requiredComponents: input.requiredComponents,
    builderBrief: normalizeNullable(input.builderBrief),
  };
}

export function makeLessonPlanToolSink(): LessonPlanToolSink {
  let result: LessonPlanToolResult | null = null;

  const lessonPlanTool = tool({
    name: "choose_lesson_plan",
    description:
      "Record the final lesson plan for the builder. Use exactly once when an interactive artifact is needed.",
    parameters: lessonPlanToolInputSchema,
    async execute(input) {
      const plan = normalizeToolInput(input);
      result = { ok: true, plan };

      return {
        ok: true,
        artifactNeeded: plan.artifactNeeded,
        lessonMode: plan.lessonMode,
        title: plan.title,
        topic: plan.topic,
      };
    },
  });

  return {
    tool: lessonPlanTool,
    getResult: () => result,
  };
}
