import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LessonPlan } from "@/lib/agent/tools/lessonPlanTool";

const agentRuns = vi.hoisted(() => ({
  calls: [] as Array<{ agentName: string; maxTurns: number | undefined }>,
  scenario: "guided-success" as "guided-success" | "critic-repair-validator-cleanup",
  builderCalls: 0,
  criticCalls: 0,
}));

vi.mock("@openai/agents", () => {
  class Agent {
    name: string;
    tools: Array<{ name: string; execute: (input: unknown) => Promise<unknown> }>;

    constructor(config: { name: string; tools: Array<{ name: string; execute: (input: unknown) => Promise<unknown> }> }) {
      this.name = config.name;
      this.tools = config.tools;
    }
  }

  return {
    Agent,
    tool: (config: { name: string; execute: (input: unknown) => Promise<unknown> }) => config,
    run: vi.fn(async (agent: Agent, _prompt: string, options?: { maxTurns?: number }) => {
      agentRuns.calls.push({ agentName: agent.name, maxTurns: options?.maxTurns });

      if (agent.name === "Parallax Builder") {
        agentRuns.builderCalls += 1;

        if (agentRuns.scenario === "critic-repair-validator-cleanup") {
          const invalidWalkthroughSteps = agentRuns.builderCalls === 2
            ? [{ id: "compare", title: "Compare ratios", narration: "This should be a control, not a walkthrough.", targetComponentIds: ["orbit"], camera: null }]
            : [];

          await agent.tools[0].execute({
            topic: "orbital resonance",
            title: "Orbital Resonance Playground",
            summary: "Adjust period ratios and compare repeating alignments.",
            lessonMode: "playground",
            interactionGoal: "Compare 2:1, 3:2, and non-resonant orbit ratios.",
            sources: null,
            controls: [
              { id: "ratio", type: "range", label: "Period Ratio", min: 1, max: 3, step: 0.5, value: 2, enabled: null },
            ],
            learningOutcomes: null,
            sceneSource: `
const star = new THREE.Group();
const orbit = new THREE.Group();
const marker = new THREE.Group();
root.add(star, orbit, marker);
registerComponent("star", "Star", star, {});
registerComponent("orbit", "Orbit paths", orbit, {});
registerComponent("marker", "Alignment marker", marker, {});
registerControl({ id: "ratio", type: "range", label: "Period Ratio", min: 1, max: 3, step: 0.5, value: 2 }, function(value) {
  orbit.userData.ratio = value;
});
setWalkthroughSteps([]);
`,
            components: [
              { id: "star", label: "Star", description: null, metadata: null },
              { id: "orbit", label: "Orbit paths", description: null, metadata: null },
              { id: "marker", label: "Alignment marker", description: null, metadata: null },
            ],
            walkthroughSteps: invalidWalkthroughSteps,
          });
        } else {
          await agent.tools[0].execute({
            topic: "cell biology",
            title: "Inside a Cell",
            summary: "A guided tour of organelles.",
            lessonMode: "guided_walkthrough",
            interactionGoal: null,
            sources: null,
            controls: null,
            learningOutcomes: null,
            sceneSource: `
const membrane = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), new THREE.MeshStandardMaterial({ color: 0x62e6d2 }));
const nucleus = new THREE.Mesh(new THREE.SphereGeometry(0.5), new THREE.MeshStandardMaterial({ color: 0xf6c76a }));
const ribosome = new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshStandardMaterial({ color: 0xffffff }));
root.add(membrane, nucleus, ribosome);
registerComponent("membrane", "Cell membrane", membrane, {});
registerComponent("nucleus", "Nucleus", nucleus, {});
registerComponent("ribosome", "Ribosome", ribosome, {});
setWalkthroughSteps([{ id: "intro", title: "Cell tour", narration: "Start with the membrane.", targetComponentIds: ["membrane"] }]);
`,
            components: [
              { id: "membrane", label: "Cell membrane", description: null, metadata: null },
              { id: "nucleus", label: "Nucleus", description: null, metadata: null },
              { id: "ribosome", label: "Ribosome", description: null, metadata: null },
            ],
            walkthroughSteps: [{ id: "intro", title: "Cell tour", narration: "Start with the membrane.", targetComponentIds: ["membrane"], camera: null }],
          });
        }
      }

      if (agent.name === "Parallax Artifact Critic") {
        agentRuns.criticCalls += 1;

        if (agentRuns.scenario === "critic-repair-validator-cleanup" && agentRuns.criticCalls === 1) {
          await agent.tools[0].execute({
            approved: false,
            factualIssues: [],
            visualIssues: ["Ratio options are not named clearly enough."],
            interactionIssues: ["The ratio control should make 2:1, 3:2, and non-resonant comparisons explicit."],
            missingComponents: [],
            repairInstructions: "Keep this as a playground; improve the ratio control without adding walkthrough steps.",
          });
          return { finalOutput: "Repair the playground." };
        }

        await agent.tools[0].execute({
          approved: true,
          factualIssues: [],
          visualIssues: [],
          interactionIssues: [],
          missingComponents: [],
          repairInstructions: null,
        });
      }

      return { finalOutput: "I built Inside a Cell." };
    }),
  };
});

const { buildLearningArtifactFromPlan } = await import("@/lib/agent/tools/buildLearningArtifactTool");

const plan: LessonPlan = {
  artifactNeeded: true,
  lessonMode: "guided_walkthrough",
  title: "Inside a Cell",
  topic: "cell biology",
  rationale: "A guided tour helps learners connect organelles.",
  interactionGoal: "Trace how organelles coordinate inside the cell.",
  researchUsed: false,
  sources: [],
  requiredComponents: ["membrane", "nucleus", "ribosome"],
  mechanismSpec: {
    topic: "cell biology",
    sourceClaims: [{ claim: "Organelles work together inside cells.", sourceUrl: undefined }],
    components: [
      { id: "membrane", label: "Cell membrane", role: "Controls the cell boundary.", visualCues: ["outer shell"], spatialHints: ["surrounds organelles"] },
      { id: "nucleus", label: "Nucleus", role: "Stores genetic information.", visualCues: ["central sphere"], spatialHints: ["inside membrane"] },
      { id: "ribosome", label: "Ribosome", role: "Builds proteins.", visualCues: ["small dots"], spatialHints: ["near nucleus"] },
    ],
    relationships: [
      { fromComponentId: "nucleus", toComponentId: "ribosome", relationship: "drives", explanation: "Instructions from the nucleus guide protein synthesis." },
    ],
    flows: [],
    learnerInteractions: [{ type: "walkthrough_step", purpose: "Move through the cell parts." }],
  },
  builderBrief: "Build a guided cell room.",
};

describe("build learning artifact flow", () => {
  beforeEach(() => {
    agentRuns.calls = [];
    agentRuns.scenario = "guided-success";
    agentRuns.builderCalls = 0;
    agentRuns.criticCalls = 0;
  });

  it("runs the artifact critic with a tight turn budget", async () => {
    await buildLearningArtifactFromPlan(plan, "Teach me about cells");

    expect(agentRuns.calls).toContainEqual({
      agentName: "Parallax Artifact Critic",
      maxTurns: 2,
    });
  });

  it("repairs validator failures introduced by a critic-requested playground rebuild", async () => {
    agentRuns.scenario = "critic-repair-validator-cleanup";

    const result = await buildLearningArtifactFromPlan({
      artifactNeeded: true,
      lessonMode: "playground",
      title: "Orbital Resonance Playground",
      topic: "orbital resonance",
      rationale: "Period ratios are clearest when learners can manipulate them.",
      interactionGoal: "Compare 2:1, 3:2, and non-resonant orbit ratios.",
      researchUsed: false,
      sources: [],
      requiredComponents: ["star", "orbit", "marker"],
      mechanismSpec: {
        topic: "orbital resonance",
        sourceClaims: [{ claim: "Orbital resonance occurs when bodies exert regular periodic gravitational influence.", sourceUrl: undefined }],
        components: [
          { id: "star", label: "Star", role: "Central gravity source.", visualCues: ["center body"], spatialHints: ["center of system"] },
          { id: "orbit", label: "Orbit paths", role: "Shows relative orbital periods.", visualCues: ["concentric rings"], spatialHints: ["around star"] },
          { id: "marker", label: "Alignment marker", role: "Marks repeated relative arrangements.", visualCues: ["highlight marker"], spatialHints: ["on orbit path"] },
        ],
        relationships: [
          { fromComponentId: "orbit", toComponentId: "marker", relationship: "drives", explanation: "The selected ratio determines where repeated alignments appear." },
        ],
        flows: [],
        learnerInteractions: [{ type: "slider", purpose: "Choose period ratios and compare repeating alignments." }],
      },
      builderBrief: "Build a playground with named ratio controls and no walkthrough.",
    }, "Make an orbital resonance playground");

    expect(result).toMatchObject({
      ok: true,
      artifact: {
        lessonMode: "playground",
        walkthroughSteps: [],
      },
    });
    expect(agentRuns.builderCalls).toBe(3);
    expect(agentRuns.criticCalls).toBe(2);
  });
});
