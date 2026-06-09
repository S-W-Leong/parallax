import { z } from "zod";

export const componentIds = [
  "fan",
  "compressor",
  "combustor",
  "turbine",
  "shaft",
  "nozzle",
  "casing",
] as const;

export const cameraPresets = [
  "wide_cutaway",
  "compressor_focus",
  "turbine_shaft_focus",
  "exhaust_focus",
] as const;

export const animationIds = [
  "airflow_intake",
  "compression_spin",
  "combustion_glow",
  "turbine_drive",
  "exhaust_thrust",
  "turbine_shaft_compressor_replay",
] as const;

export const sourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  summary: z.string().min(1),
});

export const rendererCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("focusComponents"),
    componentIds: z.array(z.enum(componentIds)).min(1),
  }),
  z.object({
    type: z.literal("selectComponent"),
    componentId: z.enum(componentIds),
  }),
  z.object({
    type: z.literal("playAnimation"),
    animation: z.enum(animationIds),
  }),
]);

export const lessonStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  narration: z.string().min(1),
  componentIds: z.array(z.enum(componentIds)).min(1),
  cameraPreset: z.enum(cameraPresets),
  animation: z.enum(animationIds),
  command: rendererCommandSchema.optional(),
});

export const quizSchema = z.object({
  question: z.string().min(1),
  answers: z.array(z.string().min(1)).min(2),
  correctAnswerIndex: z.number().int().nonnegative(),
  wrongDiagnosis: z.string().min(1),
  reteachAnimation: z.literal("turbine_shaft_compressor_replay"),
});

export const lessonSchema = z.object({
  title: z.string().min(1),
  subject: z.literal("jet_engine"),
  cacheStatus: z.enum(["local_fallback", "s3_cache", "compiled_live"]),
  steps: z.array(lessonStepSchema).length(5),
  quiz: quizSchema,
  sources: z.array(sourceSchema).min(1),
});

export type ComponentId = (typeof componentIds)[number];
export type CameraPreset = (typeof cameraPresets)[number];
export type AnimationId = (typeof animationIds)[number];
export type Lesson = z.infer<typeof lessonSchema>;
export type LessonSource = z.infer<typeof sourceSchema>;

export function parseLesson(input: unknown): Lesson {
  const lesson = lessonSchema.parse(input);
  if (lesson.quiz.correctAnswerIndex >= lesson.quiz.answers.length) {
    throw new z.ZodError([
      {
        code: "custom",
        path: ["quiz", "correctAnswerIndex"],
        message: "correctAnswerIndex must point to an answer",
      },
    ]);
  }
  return lesson;
}
