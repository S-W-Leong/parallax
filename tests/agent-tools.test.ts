import { describe, expect, it } from "vitest";
import { makeCreateExperienceToolSink } from "@/lib/agent/tools/createExperienceTool";
import { makeLessonPlanToolSink } from "@/lib/agent/tools/lessonPlanTool";
import { makeResearchStemTopicTool } from "@/lib/agent/tools/researchStemTopicTool";
import { makeSendArtifactCommandSink } from "@/lib/agent/tools/sendArtifactCommandTool";

const sceneSource = `
const membrane = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), new THREE.MeshStandardMaterial({ color: 0x62e6d2 }));
const nucleus = new THREE.Mesh(new THREE.SphereGeometry(0.5), new THREE.MeshStandardMaterial({ color: 0xf6c76a }));
const ribosome = new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshStandardMaterial({ color: 0xffffff }));
root.add(membrane, nucleus, ribosome);
registerComponent("membrane", "Cell membrane", membrane, {});
registerComponent("nucleus", "Nucleus", nucleus, {});
registerComponent("ribosome", "Ribosome", ribosome, {});
setWalkthroughSteps([{ id: "intro", title: "Cell tour", narration: "Start with the membrane.", targetComponentIds: ["membrane"] }]);
`;

describe("agent tools", () => {
  it("stores a validated artifact when create_experience succeeds", async () => {
    const sink = makeCreateExperienceToolSink();
    const output = await sink.tool.invoke(undefined as never, JSON.stringify({
      topic: "cell biology",
      title: "Inside a Cell",
      summary: "A guided tour of organelles.",
      lessonMode: "guided_walkthrough",
      interactionGoal: null,
      sources: null,
      controls: null,
      learningOutcomes: null,
      sceneSource,
      components: [
        { id: "membrane", label: "Cell membrane", description: null, metadata: null },
        { id: "nucleus", label: "Nucleus", description: null, metadata: null },
        { id: "ribosome", label: "Ribosome", description: null, metadata: null },
      ],
      walkthroughSteps: [{ id: "intro", title: "Cell tour", narration: "Start with the membrane.", targetComponentIds: ["membrane"], camera: null }],
    }));

    expect(output).toMatchObject({ ok: true });
    expect(sink.getResult()).toMatchObject({ ok: true, artifact: { title: "Inside a Cell" } });
  });

  it("accepts legacy guided walkthrough payloads without adaptive lesson fields", async () => {
    const sink = makeCreateExperienceToolSink();
    const output = await sink.tool.invoke(undefined as never, JSON.stringify({
      topic: "cell biology",
      title: "Inside a Cell",
      summary: "A guided tour of organelles.",
      sceneSource,
      components: [
        { id: "membrane", label: "Cell membrane", description: null, metadata: null },
        { id: "nucleus", label: "Nucleus", description: null, metadata: null },
        { id: "ribosome", label: "Ribosome", description: null, metadata: null },
      ],
      walkthroughSteps: [{ id: "intro", title: "Cell tour", narration: "Start with the membrane.", targetComponentIds: ["membrane"], camera: null }],
    }));

    expect(output).toMatchObject({ ok: true });
    expect(sink.getResult()).toMatchObject({
      ok: true,
      artifact: {
        lessonMode: "guided_walkthrough",
        interactionGoal: undefined,
        sources: undefined,
        controls: undefined,
        title: "Inside a Cell",
      },
    });
  });

  it("accepts a playground payload and stores lesson-mode controls", async () => {
    const sink = makeCreateExperienceToolSink();
    const output = await sink.tool.invoke(undefined as never, JSON.stringify({
      topic: "elastic potential energy",
      title: "Elastic Potential Energy Playground",
      summary: "Adjust displacement and watch stored energy change.",
      lessonMode: "playground",
      interactionGoal: "Change displacement and connect spring deformation to U = 1/2kx^2.",
      sources: [
        {
          title: "Hooke's law",
          url: "https://example.com/hookes-law",
          summary: "A quick refresher on force and displacement.",
        },
      ],
      controls: [
        { id: "displacement", type: "range", label: "Displacement", min: -2, max: 2, step: 0.1, value: 1, enabled: null },
      ],
      learningOutcomes: null,
      sceneSource: `
const spring = new THREE.Group();
const mass = new THREE.Group();
const energyBar = new THREE.Group();
root.add(spring, mass, energyBar);
registerComponent("spring", "Spring", spring, {});
registerComponent("mass", "Mass", mass, {});
registerComponent("energy-bar", "Energy Bar", energyBar, {});
registerControl({ id: "displacement", type: "range", label: "Displacement", min: -2, max: 2, step: 0.1, value: 1 }, function(value) {
  mass.position.x = value;
});
setWalkthroughSteps([]);
`,
      components: [
        { id: "spring", label: "Spring", description: null, metadata: null },
        { id: "mass", label: "Mass", description: null, metadata: null },
        { id: "energy-bar", label: "Energy Bar", description: null, metadata: null },
      ],
      walkthroughSteps: [],
    }));

    expect(output).toMatchObject({ ok: true, walkthroughStepCount: 0 });
    expect(sink.getResult()).toMatchObject({
      ok: true,
      artifact: {
        lessonMode: "playground",
        interactionGoal: "Change displacement and connect spring deformation to U = 1/2kx^2.",
        controls: [{ id: "displacement", type: "range", label: "Displacement", min: -2, max: 2, step: 0.1, value: 1 }],
        sources: [{
          title: "Hooke's law",
          url: "https://example.com/hookes-law",
          summary: "A quick refresher on force and displacement.",
        }],
        walkthroughSteps: [],
      },
    });
  });

  it("does not expose tuple-style JSON schema arrays to OpenAI", () => {
    const sink = makeCreateExperienceToolSink();
    const serialized = JSON.stringify(sink.tool.parameters);

    expect(serialized).not.toContain('"items":[{');
    expect(serialized).not.toContain("propertyNames");
    expect(serialized).not.toContain('"format":"uri"');
    expect(serialized).not.toContain('"oneOf"');
  });

  it("records a structured lesson plan from the planner tool", async () => {
    const sink = makeLessonPlanToolSink();
    const output = await sink.tool.invoke(undefined as never, JSON.stringify({
      artifactNeeded: true,
      lessonMode: "playground",
      title: "Elastic Potential Energy Playground",
      topic: "elastic potential energy",
      rationale: "The core idea is best learned by changing displacement and seeing energy respond.",
      interactionGoal: "Adjust displacement and watch U = 1/2kx^2 update.",
      researchUsed: false,
      sources: [],
      requiredComponents: ["spring", "mass", "energy bar"],
      builderBrief: "Build a spring-mass playground with a displacement slider and energy bar.",
    }));

    expect(output).toMatchObject({ ok: true, lessonMode: "playground" });
    expect(sink.getResult()).toMatchObject({
      ok: true,
      plan: {
        artifactNeeded: true,
        lessonMode: "playground",
        title: "Elastic Potential Energy Playground",
        topic: "elastic potential energy",
        rationale: "The core idea is best learned by changing displacement and seeing energy respond.",
        interactionGoal: "Adjust displacement and watch U = 1/2kx^2 update.",
        researchUsed: false,
        sources: [],
        requiredComponents: ["spring", "mass", "energy bar"],
        builderBrief: "Build a spring-mass playground with a displacement slider and energy bar.",
      },
    });
  });

  it("normalizes nullable lesson-plan fields away when no artifact is needed", async () => {
    const sink = makeLessonPlanToolSink();
    const output = await sink.tool.invoke(undefined as never, JSON.stringify({
      artifactNeeded: false,
      lessonMode: null,
      title: null,
      topic: null,
      rationale: "A direct text explanation is enough for this request.",
      interactionGoal: null,
      researchUsed: false,
      sources: [],
      requiredComponents: [],
      builderBrief: null,
    }));

    expect(output).toMatchObject({ ok: true, artifactNeeded: false });
    expect(sink.getResult()).toEqual({
      ok: true,
      plan: {
        artifactNeeded: false,
        rationale: "A direct text explanation is enough for this request.",
        researchUsed: false,
        sources: [],
        requiredComponents: [],
      },
    });
  });

  it("rejects artifact-needed lesson plans that omit required artifact fields", async () => {
    const sink = makeLessonPlanToolSink();
    const output = await sink.tool.invoke(undefined as never, JSON.stringify({
      artifactNeeded: true,
      lessonMode: null,
      title: "Elastic Potential Energy Playground",
      topic: "elastic potential energy",
      rationale: "A visual playground would help.",
      interactionGoal: "Adjust displacement and watch energy update.",
      researchUsed: false,
      sources: [],
      requiredComponents: ["spring"],
      builderBrief: "Build the spring playground.",
    }));

    expect(output).toContain("InvalidToolInputError");
    expect(sink.getResult()).toBeNull();
  });

  it("does not expose tuple-style or property-name JSON schema features in lesson-plan parameters", () => {
    const sink = makeLessonPlanToolSink();
    const serialized = JSON.stringify(sink.tool.parameters);

    expect(serialized).not.toContain('"items":[{');
    expect(serialized).not.toContain("propertyNames");
    expect(serialized).not.toContain('"format":"uri"');
  });

  it("keeps the raw validation error when create_experience fails", async () => {
    const sink = makeCreateExperienceToolSink();
    const output = await sink.tool.invoke(undefined as never, JSON.stringify({
      topic: "bad",
      title: "Bad",
      summary: "Bad artifact.",
      lessonMode: "guided_walkthrough",
      interactionGoal: null,
      sources: null,
      controls: null,
      learningOutcomes: null,
      sceneSource: `${sceneSource}\nfetch("https://example.com")`,
      components: [
        { id: "membrane", label: "Cell membrane", description: null, metadata: null },
        { id: "nucleus", label: "Nucleus", description: null, metadata: null },
        { id: "ribosome", label: "Ribosome", description: null, metadata: null },
      ],
      walkthroughSteps: [{ id: "intro", title: "Cell tour", narration: "Start with the membrane.", targetComponentIds: ["membrane"], camera: null }],
    }));

    expect(output).toMatchObject({ ok: false });
    expect(sink.getResult()).toMatchObject({ ok: false });
  });

  it("records learning-room artifact commands", async () => {
    const sink = makeSendArtifactCommandSink();
    await sink.tool.invoke(undefined as never, JSON.stringify({ type: "focus_component", componentId: "nucleus", stepId: null }));
    await sink.tool.invoke(undefined as never, JSON.stringify({ type: "explode", componentId: null, stepId: null }));

    expect(sink.getCommands()).toEqual([
      { type: "focus_component", componentId: "nucleus" },
      { type: "explode" },
    ]);
  });

  it("returns a graceful research response without EXA_API_KEY", async () => {
    const original = process.env.EXA_API_KEY;
    delete process.env.EXA_API_KEY;
    const researchTool = makeResearchStemTopicTool();

    const output = await researchTool.invoke(undefined as never, JSON.stringify({ query: "quantum dots in solar cells" }));

    expect(output).toMatchObject({ ok: true, sources: [] });
    if (original) {
      process.env.EXA_API_KEY = original;
    } else {
      delete process.env.EXA_API_KEY;
    }
  });
});
