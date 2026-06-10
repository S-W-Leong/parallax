import { run, tool, type Tool } from "@openai/agents";
import { z } from "zod";
import { artifactSourceSchema, type ArtifactRecord } from "@/lib/artifacts/artifactTypes";
import type { AgentActivityEmitter } from "../activity";
import { makeBuilderAgent, makeCriticAgent } from "../agents";
import { makeArtifactCritiqueToolSink, type ArtifactCritique } from "./artifactCritiqueTool";
import { makeCreateExperienceToolSink } from "./createExperienceTool";
import type { LessonPlan } from "./lessonPlanTool";

const lessonModeSchema = z.enum(["playground", "guided_walkthrough"]);

const mechanismSpecSchema = z.object({
  topic: z.string().min(1),
  sourceClaims: z.array(z.object({
    claim: z.string().min(1),
    sourceUrl: z.string().min(1).nullable(),
  })).min(1).max(8),
  components: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    role: z.string().min(1),
    visualCues: z.array(z.string().min(1)).min(1).max(6),
    spatialHints: z.array(z.string().min(1)).min(1).max(6),
  })).min(3).max(10),
  relationships: z.array(z.object({
    fromComponentId: z.string().min(1),
    toComponentId: z.string().min(1),
    relationship: z.enum(["drives", "contains", "connects_to", "transfers_energy_to", "flows_into", "regulates"]),
    explanation: z.string().min(1),
  })).max(12),
  flows: z.array(z.object({
    medium: z.string().min(1),
    pathComponentIds: z.array(z.string().min(1)).min(1).max(10),
    direction: z.string().min(1),
    causeEffect: z.string().min(1),
  })).max(6),
  learnerInteractions: z.array(z.object({
    type: z.enum(["focus", "explode", "toggle", "slider", "walkthrough_step"]),
    purpose: z.string().min(1),
  })).min(1).max(8),
});

const buildLearningArtifactInputSchema = z.object({
  lessonMode: lessonModeSchema,
  title: z.string().min(1),
  topic: z.string().min(1),
  rationale: z.string().min(1),
  interactionGoal: z.string().min(1),
  researchUsed: z.boolean(),
  sources: z.array(artifactSourceSchema).max(4),
  requiredComponents: z.array(z.string().min(1)).min(1).max(8),
  mechanismSpec: mechanismSpecSchema,
  builderBrief: z.string().min(1),
  requestMessage: z.string().min(1).nullable(),
});

export type BuildLearningArtifactResult = {
  ok: true;
  message: string;
  trace: string[];
  artifact: ArtifactRecord;
} | {
  ok: false;
  message: string;
  trace: string[];
  error: string;
};

export type BuildLearningArtifactToolSink = {
  tool: Tool;
  getResult: () => BuildLearningArtifactResult | null;
};

type BuildLearningArtifactOptions = {
  onActivity?: AgentActivityEmitter;
};

function makeBuilderPrompt(
  plan: LessonPlan,
  requestMessage: string,
  feedback?: { critic?: ArtifactCritique; validatorError?: string },
): string {
  const criticFeedback = feedback?.critic
    ? `\n\nCritic feedback from previous attempt:\n${JSON.stringify(feedback.critic, null, 2)}`
    : "";
  const validatorFeedback = feedback?.validatorError
    ? `\n\nValidator feedback from previous attempt:\n${feedback.validatorError}\nRepair the artifact and call create_experience exactly once. Match the selected lessonMode rules exactly.`
    : "";
  return `Lesson plan:\n${JSON.stringify(plan)}\n\nOriginal user request:\n${requestMessage}${criticFeedback}${validatorFeedback}`;
}

function makeArtifactTrace(plan: LessonPlan): string[] {
  return [
    plan.researchUsed ? "Grounding lesson plan with Exa" : "Skipping research for stable topic",
    `Selected ${plan.lessonMode ?? "unknown"} lesson mode`,
    "Generating interactive 3D artifact",
    "Validating artifact contract",
  ];
}

function emitActivity(options: BuildLearningArtifactOptions | undefined, activity: Parameters<AgentActivityEmitter>[0]) {
  options?.onActivity?.(activity);
}

function makeCriticPrompt(plan: LessonPlan, artifact: ArtifactRecord, requestMessage: string): string {
  const artifactForReview = {
    id: artifact.id,
    title: artifact.title,
    topic: artifact.topic,
    summary: artifact.summary,
    lessonMode: artifact.lessonMode,
    interactionGoal: artifact.interactionGoal,
    sources: artifact.sources ?? [],
    controls: artifact.controls ?? [],
    components: artifact.components,
    walkthroughSteps: artifact.walkthroughSteps,
    sceneSource: artifact.sceneSource,
  };

  return `Lesson plan:\n${JSON.stringify(plan, null, 2)}\n\nOriginal user request:\n${requestMessage}\n\nArtifact to review:\n${JSON.stringify(artifactForReview, null, 2)}`;
}

async function critiqueArtifact(plan: LessonPlan, artifact: ArtifactRecord, requestMessage: string) {
  const critiqueSink = makeArtifactCritiqueToolSink();
  const criticAgent = makeCriticAgent([critiqueSink.tool]);
  await run(criticAgent, makeCriticPrompt(plan, artifact, requestMessage), { maxTurns: 2 });

  const critique = critiqueSink.getResult();
  if (!critique) {
    return {
      ok: false as const,
      error: "The artifact critic did not call critique_artifact.",
    };
  }

  return {
    ok: true as const,
    critique,
  };
}

function critiqueIssueSummary(critique: ArtifactCritique): string {
  return [
    ...critique.factualIssues,
    ...critique.visualIssues,
    ...critique.interactionIssues,
    ...critique.missingComponents.map((component) => `Missing component: ${component}`),
  ].join(" ");
}

function blockedArtifactMessage(title: string, critique: ArtifactCritique): string {
  const issueSummary = critiqueIssueSummary(critique);
  const repair = critique.repairInstructions ? `Repair guidance: ${critique.repairInstructions}` : "";
  const detail = [issueSummary, repair].filter(Boolean).join(" ");
  return `I couldn't generate a reliable artifact for "${title}" yet.${detail ? ` ${detail}` : ""}`;
}

function finalOutputText(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value;
  if (value == null) return fallback;
  return JSON.stringify(value);
}

function missingCreateExperienceErrorMessage(plan: LessonPlan): string {
  const title = plan.title?.trim();
  return title
    ? `The builder did not call create_experience for the planned artifact "${title}".`
    : "The builder did not call create_experience for the planned artifact.";
}

function normalizePlan(input: z.infer<typeof buildLearningArtifactInputSchema>): LessonPlan {
  return {
    artifactNeeded: true,
    lessonMode: input.lessonMode,
    title: input.title,
    topic: input.topic,
    rationale: input.rationale,
    interactionGoal: input.interactionGoal,
    researchUsed: input.researchUsed,
    sources: input.sources,
    requiredComponents: input.requiredComponents,
    mechanismSpec: {
      ...input.mechanismSpec,
      sourceClaims: input.mechanismSpec.sourceClaims.map((claim) => ({
        claim: claim.claim,
        sourceUrl: claim.sourceUrl ?? undefined,
      })),
    },
    builderBrief: input.builderBrief,
  };
}

export async function buildLearningArtifactFromPlan(
  plan: LessonPlan,
  requestMessage: string,
  options: BuildLearningArtifactOptions = {},
): Promise<BuildLearningArtifactResult> {
  const createExperience = makeCreateExperienceToolSink();
  const builderAgent = makeBuilderAgent([createExperience.tool]);
  const trace = makeArtifactTrace(plan);
  emitActivity(options, {
    type: "phase.started",
    phase: plan.researchUsed ? "research" : "artifact.build",
    label: plan.researchUsed ? "Grounding lesson plan with sources" : "Using stable topic knowledge",
  });
  emitActivity(options, {
    type: "phase.started",
    phase: "artifact.build",
    label: "Generating interactive 3D artifact",
    detail: plan.title,
  });
  let builderResult = await run(builderAgent, makeBuilderPrompt(plan, requestMessage), { maxTurns: 8 });
  let artifactResult = createExperience.getResult();

  if (!artifactResult || !artifactResult.ok) {
    const validationError = artifactResult?.ok === false
      ? artifactResult.error
      : missingCreateExperienceErrorMessage(plan);
    emitActivity(options, {
      type: "phase.completed",
      phase: "artifact.validate",
      label: "Artifact validation needs repair",
      ok: false,
      detail: validationError,
    });
    trace.push("Repairing artifact from validator feedback");
    emitActivity(options, {
      type: "phase.started",
      phase: "artifact.build",
      label: "Repairing artifact from validator feedback",
    });
    createExperience.clearResult();
    builderResult = await run(builderAgent, makeBuilderPrompt(plan, requestMessage, { validatorError: validationError }), { maxTurns: 8 });
    artifactResult = createExperience.getResult();
  }

  if (!artifactResult) {
    const error = missingCreateExperienceErrorMessage(plan);
    emitActivity(options, {
      type: "phase.completed",
      phase: "artifact.build",
      label: "Artifact generation failed",
      ok: false,
      detail: error,
    });
    return { ok: false, message: error, trace, error };
  }

  if (!artifactResult.ok) {
    emitActivity(options, {
      type: "phase.completed",
      phase: "artifact.validate",
      label: "Artifact validation failed",
      ok: false,
      detail: artifactResult.error,
    });
    return { ok: false, message: artifactResult.error, trace, error: artifactResult.error };
  }

  let acceptedArtifact = artifactResult.artifact;
  let acceptedResult = builderResult;
  emitActivity(options, {
    type: "phase.completed",
    phase: "artifact.validate",
    label: "Artifact contract validated",
    ok: true,
  });
  trace.push("Reviewing artifact accuracy");
  emitActivity(options, {
    type: "phase.started",
    phase: "artifact.critique",
    label: "Reviewing artifact accuracy",
  });
  const critique = await critiqueArtifact(plan, acceptedArtifact, requestMessage);
  if (!critique.ok) {
    emitActivity(options, {
      type: "phase.completed",
      phase: "artifact.critique",
      label: "Artifact critique failed",
      ok: false,
      detail: critique.error,
    });
    return { ok: false, message: critique.error, trace, error: critique.error };
  }

  if (!critique.critique.approved) {
    trace.push("Repairing artifact from critic feedback");
    emitActivity(options, {
      type: "phase.completed",
      phase: "artifact.critique",
      label: "Critic requested artifact repair",
      ok: false,
      detail: critiqueIssueSummary(critique.critique),
    });
    emitActivity(options, {
      type: "phase.started",
      phase: "artifact.build",
      label: "Repairing artifact from critic feedback",
    });
    createExperience.clearResult();
    let retryResult = await run(builderAgent, makeBuilderPrompt(plan, requestMessage, { critic: critique.critique }), { maxTurns: 8 });
    let retryArtifactResult = createExperience.getResult();

    if (!retryArtifactResult) {
      const error = missingCreateExperienceErrorMessage(plan);
      emitActivity(options, {
        type: "phase.completed",
        phase: "artifact.build",
        label: "Artifact repair failed",
        ok: false,
        detail: error,
      });
      return { ok: false, message: error, trace, error };
    }

    if (!retryArtifactResult.ok) {
      emitActivity(options, {
        type: "phase.completed",
        phase: "artifact.validate",
        label: "Repaired artifact validation failed",
        ok: false,
        detail: retryArtifactResult.error,
      });
      trace.push("Repairing artifact from validator feedback");
      emitActivity(options, {
        type: "phase.started",
        phase: "artifact.build",
        label: "Repairing artifact from validator feedback",
      });
      createExperience.clearResult();
      retryResult = await run(
        builderAgent,
        makeBuilderPrompt(plan, requestMessage, { critic: critique.critique, validatorError: retryArtifactResult.error }),
        { maxTurns: 8 },
      );
      retryArtifactResult = createExperience.getResult();

      if (!retryArtifactResult) {
        const error = missingCreateExperienceErrorMessage(plan);
        emitActivity(options, {
          type: "phase.completed",
          phase: "artifact.build",
          label: "Artifact repair failed",
          ok: false,
          detail: error,
        });
        return { ok: false, message: error, trace, error };
      }

      if (!retryArtifactResult.ok) {
        emitActivity(options, {
          type: "phase.completed",
          phase: "artifact.validate",
          label: "Repaired artifact validation failed",
          ok: false,
          detail: retryArtifactResult.error,
        });
        return { ok: false, message: retryArtifactResult.error, trace, error: retryArtifactResult.error };
      }
    }

    trace.push("Re-reviewing artifact accuracy");
    emitActivity(options, {
      type: "phase.completed",
      phase: "artifact.validate",
      label: "Repaired artifact contract validated",
      ok: true,
    });
    emitActivity(options, {
      type: "phase.started",
      phase: "artifact.critique",
      label: "Re-reviewing artifact accuracy",
    });
    const retryCritique = await critiqueArtifact(plan, retryArtifactResult.artifact, requestMessage);
    if (!retryCritique.ok) {
      emitActivity(options, {
        type: "phase.completed",
        phase: "artifact.critique",
        label: "Artifact re-review failed",
        ok: false,
        detail: retryCritique.error,
      });
      return { ok: false, message: retryCritique.error, trace, error: retryCritique.error };
    }

    if (!retryCritique.critique.approved) {
      const message = blockedArtifactMessage(retryArtifactResult.artifact.title, retryCritique.critique);
      emitActivity(options, {
        type: "phase.completed",
        phase: "artifact.critique",
        label: "Critic blocked artifact",
        ok: false,
        detail: message,
      });
      return { ok: false, message, trace, error: message };
    }

    acceptedArtifact = retryArtifactResult.artifact;
    acceptedResult = retryResult;
  }

  emitActivity(options, {
    type: "phase.completed",
    phase: "artifact.critique",
    label: "Artifact approved",
    ok: true,
  });
  const message = finalOutputText(acceptedResult.finalOutput, `I built ${acceptedArtifact.title}.`);
  return { ok: true, message, trace, artifact: acceptedArtifact };
}

export function makeBuildLearningArtifactToolSink(options: BuildLearningArtifactOptions = {}): BuildLearningArtifactToolSink {
  let result: BuildLearningArtifactResult | null = null;

  const buildTool = tool({
    name: "build_learning_artifact",
    description:
      "Build or rebuild a complete, QA-reviewed Parallax 3D learning artifact from a concrete lesson plan.",
    parameters: buildLearningArtifactInputSchema,
    async execute(input) {
      const plan = normalizePlan(input);
      result = await buildLearningArtifactFromPlan(plan, input.requestMessage ?? input.builderBrief, options);

      if (!result.ok) {
        return {
          ok: false,
          error: result.error,
          trace: result.trace,
        };
      }

      return {
        ok: true,
        artifactId: result.artifact.id,
        title: result.artifact.title,
        componentCount: result.artifact.components.length,
        walkthroughStepCount: result.artifact.walkthroughSteps.length,
        trace: result.trace,
      };
    },
  });

  return {
    tool: buildTool,
    getResult: () => result,
  };
}
