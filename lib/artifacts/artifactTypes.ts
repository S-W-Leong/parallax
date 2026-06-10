import { z } from "zod";

export const artifactComponentSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const cameraPoseSchema = z.object({
  position: z.tuple([z.number(), z.number(), z.number()]).optional(),
  lookAt: z.tuple([z.number(), z.number(), z.number()]).optional(),
});

export const walkthroughStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  narration: z.string().min(1),
  targetComponentIds: z.array(z.string().min(1)).default([]),
  camera: cameraPoseSchema.optional(),
});

export const learningOutcomeSchema = z.string().min(1).max(96);

export const lessonModeSchema = z.enum(["playground", "guided_walkthrough"]);

const urlStringSchema = z.string().min(1).refine((value) => {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}, "Expected a valid URL.");

export const artifactSourceSchema = z.object({
  title: z.string().min(1),
  url: urlStringSchema,
  summary: z.string().min(1),
});

const rangeArtifactControlSchema = z.object({
  id: z.string().min(1),
  type: z.literal("range"),
  label: z.string().min(1),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  value: z.number(),
}).superRefine((control, ctx) => {
  if (control.max <= control.min) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["max"],
      message: "Range control max must be greater than min.",
    });
  }

  if (control.value < control.min || control.value > control.max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["value"],
      message: "Range control value must be within [min, max].",
    });
  }
});

const toggleArtifactControlSchema = z.object({
  id: z.string().min(1),
  type: z.literal("toggle"),
  label: z.string().min(1),
  value: z.boolean(),
});

export const artifactControlSchema = z.discriminatedUnion("type", [
  rangeArtifactControlSchema,
  toggleArtifactControlSchema,
]);

export const artifactRecordSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  topic: z.string().min(1),
  summary: z.string().min(1),
  lessonMode: lessonModeSchema.default("guided_walkthrough"),
  interactionGoal: z.string().min(1).optional(),
  sources: z.array(artifactSourceSchema).max(4).optional(),
  controls: z.array(artifactControlSchema).max(6).optional(),
  sceneSource: z.string().min(1),
  html: z.string().min(1),
  components: z.array(artifactComponentSchema).min(1),
  walkthroughSteps: z.array(walkthroughStepSchema),
  learningOutcomes: z.array(learningOutcomeSchema).max(3).optional(),
  createdAt: z.string().min(1),
});

export const selectedComponentSchema = z.object({
  artifactId: z.string().min(1),
  id: z.string().min(1),
  label: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const chatMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  createdAt: z.string().min(1),
  artifactId: z.string().optional(),
  status: z.enum(["streaming", "complete", "stopped"]).optional(),
});

export const focusComponentCommandSchema = z.object({
  type: z.literal("focus_component"),
  componentId: z.string().min(1),
});

export const goToStepCommandSchema = z.object({
  type: z.literal("go_to_step"),
  stepId: z.string().min(1),
});

export const artifactCommandSchema = z.discriminatedUnion("type", [
  focusComponentCommandSchema,
  goToStepCommandSchema,
  z.object({ type: z.literal("start_walkthrough") }),
  z.object({ type: z.literal("pause_walkthrough") }),
  z.object({ type: z.literal("reset_camera") }),
  z.object({ type: z.literal("explode") }),
  z.object({ type: z.literal("collapse") }),
  z.object({ type: z.literal("toggle_labels") }),
]);

export const artifactEventSchema = z.discriminatedUnion("type", [
  z.object({
    source: z.literal("parallax-artifact"),
    type: z.literal("artifact_ready"),
    artifactId: z.string().min(1),
  }),
  z.object({
    source: z.literal("parallax-artifact"),
    type: z.literal("component_selected"),
    artifactId: z.string().min(1),
    componentId: z.string().min(1),
    label: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    source: z.literal("parallax-artifact"),
    type: z.literal("walkthrough_step_changed"),
    artifactId: z.string().min(1),
    stepId: z.string().min(1),
    title: z.string().min(1),
  }),
  z.object({
    source: z.literal("parallax-artifact"),
    type: z.literal("artifact_error"),
    artifactId: z.string().min(1),
    message: z.string().min(1),
  }),
]);

export const parentArtifactMessageSchema = z.object({
  source: z.literal("parallax-parent"),
  type: z.literal("artifact_command"),
  artifactId: z.string().min(1),
  command: artifactCommandSchema,
});

export const createExperienceInputSchema = z.object({
  topic: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  lessonMode: lessonModeSchema.default("guided_walkthrough"),
  interactionGoal: z.string().min(1).optional(),
  sources: z.array(artifactSourceSchema).max(4).optional(),
  controls: z.array(artifactControlSchema).max(6).optional(),
  sceneSource: z.string().min(1),
  components: z.array(artifactComponentSchema).min(3),
  walkthroughSteps: z.array(walkthroughStepSchema),
  learningOutcomes: z.array(learningOutcomeSchema).min(1).max(3).optional(),
});

export const learningSessionSchema = z.object({
  id: z.string().min(1),
  mode: z.enum(["chat", "learning_room"]),
  messages: z.array(chatMessageSchema),
  artifacts: z.record(z.string(), artifactRecordSchema),
  activeArtifactId: z.string().nullable(),
  lastArtifactId: z.string().nullable(),
  selectedComponent: selectedComponentSchema.nullable(),
  activeStepId: z.string().nullable(),
  pendingCommands: z.array(artifactCommandSchema),
  trace: z.array(z.string()),
});

export type ArtifactComponent = z.infer<typeof artifactComponentSchema>;
export type WalkthroughStep = z.infer<typeof walkthroughStepSchema>;
export type ArtifactRecord = z.infer<typeof artifactRecordSchema>;
export type LessonMode = z.infer<typeof lessonModeSchema>;
export type ArtifactSource = z.infer<typeof artifactSourceSchema>;
export type ArtifactControl = z.infer<typeof artifactControlSchema>;
export type SelectedComponent = z.infer<typeof selectedComponentSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ArtifactCommand = z.infer<typeof artifactCommandSchema>;
export type ArtifactEvent = z.infer<typeof artifactEventSchema>;
export type ParentArtifactMessage = z.infer<typeof parentArtifactMessageSchema>;
export type CreateExperienceInput = z.infer<typeof createExperienceInputSchema>;
export type LearningSession = z.infer<typeof learningSessionSchema>;
