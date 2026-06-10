import { describe, expect, it } from "vitest";
import { createArtifactRecord, validateSceneSource } from "@/lib/artifacts/artifactValidator";

const validSceneSource = `
const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), new THREE.MeshStandardMaterial({ color: 0x42d6b7 }));
body.name = "Cell membrane";
root.add(body);
registerComponent("membrane", "Cell membrane", body, { role: "Boundary" });
registerComponent("nucleus", "Nucleus", new THREE.Mesh(new THREE.SphereGeometry(0.5), new THREE.MeshStandardMaterial()), {});
registerComponent("ribosome", "Ribosome", new THREE.Mesh(new THREE.SphereGeometry(0.18), new THREE.MeshStandardMaterial()), {});
setWalkthroughSteps([
  { id: "step-1", title: "Find the membrane", narration: "The membrane controls what enters.", targetComponentIds: ["membrane"] },
  { id: "step-2", title: "Inspect the nucleus", narration: "The nucleus stores DNA.", targetComponentIds: ["nucleus"] },
  { id: "step-3", title: "Locate ribosomes", narration: "Ribosomes build proteins.", targetComponentIds: ["ribosome"] }
]);
`;

describe("artifact validation", () => {
  it("accepts a scene that registers components and walkthrough steps", () => {
    expect(validateSceneSource(validSceneSource)).toMatchObject({ ok: true });
  });

  it("rejects network calls in generated scene code", () => {
    const result = validateSceneSource(`${validSceneSource}\nfetch("https://example.com")`);
    expect(result).toMatchObject({ ok: false });
    expect(result.error).toContain("network");
  });

  it("rejects generated canvas text labels because runtime labels own label visibility", () => {
    const result = validateSceneSource(`
const canvas = document.createElement("canvas");
const context = canvas.getContext("2d");
context.fillText("Glycolysis", 12, 24);
const texture = new THREE.CanvasTexture(canvas);
const labelPlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.5), new THREE.MeshBasicMaterial({ map: texture }));
const glucose = new THREE.Group();
const oxygen = new THREE.Group();
const mitochondrion = new THREE.Group();
root.add(labelPlane, glucose, oxygen, mitochondrion);
registerComponent("glucose", "Glucose", glucose, {});
registerComponent("oxygen", "Oxygen", oxygen, {});
registerComponent("mitochondrion", "Mitochondrion", mitochondrion, {});
setWalkthroughSteps([{ id: "intro", title: "Inputs", narration: "Start with glucose and oxygen.", targetComponentIds: ["glucose"] }]);
`);

    expect(result).toMatchObject({ ok: false });
    expect(result.error).toContain("runtime labels");
  });

  it("rejects JavaScript syntax errors before creating an artifact", () => {
    const invalidSceneSource = `
const 3DModel = new THREE.Group();
root.add(3DModel);
registerComponent("model", "Model", 3DModel, {});
registerComponent("part-a", "Part A", 3DModel, {});
registerComponent("part-b", "Part B", 3DModel, {});
setWalkthroughSteps([{ id: "intro", title: "Intro", narration: "Start here.", targetComponentIds: ["model"] }]);
`;

    const result = validateSceneSource(invalidSceneSource);

    expect(result).toMatchObject({ ok: false });
    expect(result.error).toContain("Generated scene source has invalid JavaScript syntax");
  });

  it("builds an artifact record only after scene validation passes", () => {
    const result = createArtifactRecord({
      topic: "cells",
      title: "Inside a Cell",
      summary: "A guided model of cell structures.",
      sceneSource: validSceneSource,
      components: [
        { id: "membrane", label: "Cell membrane", description: "Boundary layer" },
        { id: "nucleus", label: "Nucleus", description: "DNA store" },
        { id: "ribosome", label: "Ribosome", description: "Protein builder" },
      ],
      walkthroughSteps: [
        { id: "step-1", title: "Find the membrane", narration: "The membrane controls what enters.", targetComponentIds: ["membrane"] },
        { id: "step-2", title: "Inspect the nucleus", narration: "The nucleus stores DNA.", targetComponentIds: ["nucleus"] },
        { id: "step-3", title: "Locate ribosomes", narration: "Ribosomes build proteins.", targetComponentIds: ["ribosome"] },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.artifact.html).toContain("Inside a Cell");
      expect(result.artifact.components).toHaveLength(3);
    }
  });

  it("preserves friendly learning outcomes on created artifacts", () => {
    const result = createArtifactRecord({
      topic: "turbines",
      title: "Turbine Lab",
      summary: "Explore turbine stages.",
      learningOutcomes: ["Trace airflow", "Compare pressure zones", "See thrust form"],
      sceneSource: `
const a = new THREE.Group();
const b = new THREE.Group();
const c = new THREE.Group();
root.add(a, b, c);
registerComponent("fan", "Fan", a, {});
registerComponent("compressor", "Compressor", b, {});
registerComponent("combustor", "Combustor", c, {});
setWalkthroughSteps([{ id: "intro", title: "Trace airflow", narration: "Follow the path.", targetComponentIds: ["fan"] }]);
`,
      components: [
        { id: "fan", label: "Fan" },
        { id: "compressor", label: "Compressor" },
        { id: "combustor", label: "Combustor" },
      ],
      walkthroughSteps: [{ id: "intro", title: "Trace airflow", narration: "Follow the path.", targetComponentIds: ["fan"] }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.artifact.learningOutcomes).toEqual(["Trace airflow", "Compare pressure zones", "See thrust form"]);
    }
  });

  it("builds a playground artifact record with controls and no walkthrough steps", () => {
    const result = createArtifactRecord({
      topic: "oscillations",
      title: "Spring Playground",
      summary: "Explore how displacement changes stored energy.",
      lessonMode: "playground",
      interactionGoal: "Adjust the spring displacement and compare the energy transfer.",
      sceneSource: `
const spring = new THREE.Group();
const mass = new THREE.Group();
const energyBar = new THREE.Group();
root.add(spring, mass, energyBar);
registerComponent("spring", "Spring", spring, {});
registerComponent("mass", "Mass", mass, {});
registerComponent("energy-bar", "Energy Bar", energyBar, {});
registerControl({ id: "displacement", type: "range", label: "Displacement", min: -2, max: 2, step: 0.1, value: 0 }, function(value) {
  mass.position.x = value;
});
setWalkthroughSteps([]);
`,
      components: [
        { id: "spring", label: "Spring" },
        { id: "mass", label: "Mass" },
        { id: "energy-bar", label: "Energy Bar" },
      ],
      controls: [
        { id: "displacement", type: "range", label: "Displacement", min: -2, max: 2, step: 0.1, value: 0 },
      ],
      walkthroughSteps: [],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.artifact.lessonMode).toBe("playground");
      expect(result.artifact.walkthroughSteps).toEqual([]);
      expect(result.artifact.controls?.[0]?.id).toBe("displacement");
    }
  });

  it("rejects range controls whose max is not greater than min", () => {
    const result = createArtifactRecord({
      topic: "oscillations",
      title: "Spring Playground",
      summary: "Explore how displacement changes stored energy.",
      lessonMode: "playground",
      sceneSource: `
const spring = new THREE.Group();
const mass = new THREE.Group();
const energyBar = new THREE.Group();
root.add(spring, mass, energyBar);
registerComponent("spring", "Spring", spring, {});
registerComponent("mass", "Mass", mass, {});
registerComponent("energy-bar", "Energy Bar", energyBar, {});
registerControl({ id: "displacement", type: "range", label: "Displacement", min: 2, max: 2, step: 0.1, value: 2 }, function(value) {
  mass.position.x = value;
});
setWalkthroughSteps([]);
`,
      components: [
        { id: "spring", label: "Spring" },
        { id: "mass", label: "Mass" },
        { id: "energy-bar", label: "Energy Bar" },
      ],
      controls: [
        { id: "displacement", type: "range", label: "Displacement", min: 2, max: 2, step: 0.1, value: 2 },
      ],
      walkthroughSteps: [],
    });

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) {
      expect(result.error).toContain("greater than min");
    }
  });

  it("rejects range controls whose value falls outside the allowed bounds", () => {
    const result = createArtifactRecord({
      topic: "oscillations",
      title: "Spring Playground",
      summary: "Explore how displacement changes stored energy.",
      lessonMode: "playground",
      sceneSource: `
const spring = new THREE.Group();
const mass = new THREE.Group();
const energyBar = new THREE.Group();
root.add(spring, mass, energyBar);
registerComponent("spring", "Spring", spring, {});
registerComponent("mass", "Mass", mass, {});
registerComponent("energy-bar", "Energy Bar", energyBar, {});
registerControl({ id: "displacement", type: "range", label: "Displacement", min: -2, max: 2, step: 0.1, value: 3 }, function(value) {
  mass.position.x = value;
});
setWalkthroughSteps([]);
`,
      components: [
        { id: "spring", label: "Spring" },
        { id: "mass", label: "Mass" },
        { id: "energy-bar", label: "Energy Bar" },
      ],
      controls: [
        { id: "displacement", type: "range", label: "Displacement", min: -2, max: 2, step: 0.1, value: 3 },
      ],
      walkthroughSteps: [],
    });

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) {
      expect(result.error).toContain("within");
    }
  });

  it("rejects declared components that are not referenced by scene source", () => {
    const result = createArtifactRecord({
      topic: "cells",
      title: "Inside a Cell",
      summary: "A guided model of cell structures.",
      sceneSource: validSceneSource,
      components: [
        { id: "membrane", label: "Cell membrane" },
        { id: "nucleus", label: "Nucleus" },
        { id: "missing", label: "Missing part" },
      ],
      walkthroughSteps: [
        { id: "step-1", title: "Find the membrane", narration: "The membrane controls what enters.", targetComponentIds: ["membrane"] },
      ],
    });

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toContain("missing");
  });

  it("rejects a playground artifact without registered controls", () => {
    const result = createArtifactRecord({
      topic: "oscillations",
      title: "Spring Playground",
      summary: "Explore how displacement changes stored energy.",
      lessonMode: "playground",
      controls: [
        { id: "displacement", type: "range", label: "Displacement", min: -2, max: 2, step: 0.1, value: 0 },
      ],
      sceneSource: `
const spring = new THREE.Group();
const mass = new THREE.Group();
const energyBar = new THREE.Group();
root.add(spring, mass, energyBar);
registerComponent("spring", "Spring", spring, {});
registerComponent("mass", "Mass", mass, {});
registerComponent("energy-bar", "Energy Bar", energyBar, {});
setWalkthroughSteps([]);
`,
      components: [
        { id: "spring", label: "Spring" },
        { id: "mass", label: "Mass" },
        { id: "energy-bar", label: "Energy Bar" },
      ],
      walkthroughSteps: [],
    });

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) {
      expect(result.error).toContain("registerControl");
    }
  });

  it("rejects a guided walkthrough without steps", () => {
    const result = createArtifactRecord({
      topic: "cells",
      title: "Inside a Cell",
      summary: "A guided model of cell structures.",
      lessonMode: "guided_walkthrough",
      sceneSource: `
const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), new THREE.MeshStandardMaterial({ color: 0x42d6b7 }));
const nucleus = new THREE.Mesh(new THREE.SphereGeometry(0.5), new THREE.MeshStandardMaterial());
const ribosome = new THREE.Mesh(new THREE.SphereGeometry(0.18), new THREE.MeshStandardMaterial());
root.add(body, nucleus, ribosome);
registerComponent("membrane", "Cell membrane", body, { role: "Boundary" });
registerComponent("nucleus", "Nucleus", nucleus, {});
registerComponent("ribosome", "Ribosome", ribosome, {});
setWalkthroughSteps([]);
`,
      components: [
        { id: "membrane", label: "Cell membrane" },
        { id: "nucleus", label: "Nucleus" },
        { id: "ribosome", label: "Ribosome" },
      ],
      walkthroughSteps: [],
    });

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) {
      expect(result.error).toContain("at least one step");
    }
  });

  it("rejects guided walkthrough artifacts that declare controls", () => {
    const result = createArtifactRecord({
      topic: "cells",
      title: "Inside a Cell",
      summary: "A guided model of cell structures.",
      lessonMode: "guided_walkthrough",
      controls: [
        { id: "labels", type: "toggle", label: "Labels", value: true },
      ],
      sceneSource: `
const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), new THREE.MeshStandardMaterial({ color: 0x42d6b7 }));
const nucleus = new THREE.Mesh(new THREE.SphereGeometry(0.5), new THREE.MeshStandardMaterial());
const ribosome = new THREE.Mesh(new THREE.SphereGeometry(0.18), new THREE.MeshStandardMaterial());
root.add(body, nucleus, ribosome);
registerComponent("membrane", "Cell membrane", body, { role: "Boundary" });
registerComponent("nucleus", "Nucleus", nucleus, {});
registerComponent("ribosome", "Ribosome", ribosome, {});
setWalkthroughSteps([{ id: "intro", title: "Start", narration: "Begin at the membrane.", targetComponentIds: ["membrane"] }]);
`,
      components: [
        { id: "membrane", label: "Cell membrane" },
        { id: "nucleus", label: "Nucleus" },
        { id: "ribosome", label: "Ribosome" },
      ],
      walkthroughSteps: [
        { id: "intro", title: "Start", narration: "Begin at the membrane.", targetComponentIds: ["membrane"] },
      ],
    });

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) {
      expect(result.error).toContain("must not declare controls");
    }
  });

  it("rejects guided walkthrough scene source that calls registerControl", () => {
    const result = createArtifactRecord({
      topic: "cells",
      title: "Inside a Cell",
      summary: "A guided model of cell structures.",
      lessonMode: "guided_walkthrough",
      sceneSource: `
const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), new THREE.MeshStandardMaterial({ color: 0x42d6b7 }));
const nucleus = new THREE.Mesh(new THREE.SphereGeometry(0.5), new THREE.MeshStandardMaterial());
const ribosome = new THREE.Mesh(new THREE.SphereGeometry(0.18), new THREE.MeshStandardMaterial());
root.add(body, nucleus, ribosome);
registerComponent("membrane", "Cell membrane", body, { role: "Boundary" });
registerComponent("nucleus", "Nucleus", nucleus, {});
registerComponent("ribosome", "Ribosome", ribosome, {});
registerControl({ id: "labels", type: "toggle", label: "Labels", value: true }, function(value) {
  setStatus(String(value));
});
setWalkthroughSteps([{ id: "intro", title: "Start", narration: "Begin at the membrane.", targetComponentIds: ["membrane"] }]);
`,
      components: [
        { id: "membrane", label: "Cell membrane" },
        { id: "nucleus", label: "Nucleus" },
        { id: "ribosome", label: "Ribosome" },
      ],
      walkthroughSteps: [
        { id: "intro", title: "Start", narration: "Begin at the membrane.", targetComponentIds: ["membrane"] },
      ],
    });

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) {
      expect(result.error).toContain("must not call registerControl");
    }
  });

  it("rejects declared controls that are not referenced by scene source", () => {
    const result = createArtifactRecord({
      topic: "oscillations",
      title: "Spring Playground",
      summary: "Explore how displacement changes stored energy.",
      lessonMode: "playground",
      controls: [
        { id: "displacement", type: "range", label: "Displacement", min: -2, max: 2, step: 0.1, value: 0 },
      ],
      sceneSource: `
const spring = new THREE.Group();
const mass = new THREE.Group();
const energyBar = new THREE.Group();
root.add(spring, mass, energyBar);
registerComponent("spring", "Spring", spring, {});
registerComponent("mass", "Mass", mass, {});
registerComponent("energy-bar", "Energy Bar", energyBar, {});
registerControl({ id: "other-control", type: "range", label: "Other", min: -2, max: 2, step: 0.1, value: 0 }, function(value) {
  mass.position.x = value;
});
setWalkthroughSteps([]);
`,
      components: [
        { id: "spring", label: "Spring" },
        { id: "mass", label: "Mass" },
        { id: "energy-bar", label: "Energy Bar" },
      ],
      walkthroughSteps: [],
    });

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) {
      expect(result.error).toContain("displacement");
    }
  });

  it("rejects controls whose id appears only outside registerControl", () => {
    const result = createArtifactRecord({
      topic: "oscillations",
      title: "Spring Playground",
      summary: "Explore how displacement changes stored energy.",
      lessonMode: "playground",
      controls: [
        { id: "displacement", type: "range", label: "Displacement", min: -2, max: 2, step: 0.1, value: 0 },
      ],
      sceneSource: `
const spring = new THREE.Group();
const mass = new THREE.Group();
const energyBar = new THREE.Group();
const label = "displacement";
// displacement should not count unless registerControl uses it
root.add(spring, mass, energyBar);
registerComponent("spring", "Spring", spring, {});
registerComponent("mass", "Mass", mass, {});
registerComponent("energy-bar", "Energy Bar", energyBar, {});
registerControl({ id: "wrong", type: "range", label: "Other", min: -2, max: 2, step: 0.1, value: 0 }, function(value) {
  mass.position.x = value;
  return label;
});
setWalkthroughSteps([]);
`,
      components: [
        { id: "spring", label: "Spring" },
        { id: "mass", label: "Mass" },
        { id: "energy-bar", label: "Energy Bar" },
      ],
      walkthroughSteps: [],
    });

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) {
      expect(result.error).toContain("displacement");
    }
  });

  it("rejects playground artifacts whose scene source registers undeclared extra controls", () => {
    const result = createArtifactRecord({
      topic: "oscillations",
      title: "Spring Playground",
      summary: "Explore how displacement changes stored energy.",
      lessonMode: "playground",
      controls: [
        { id: "displacement", type: "range", label: "Displacement", min: -2, max: 2, step: 0.1, value: 0 },
      ],
      sceneSource: `
const spring = new THREE.Group();
const mass = new THREE.Group();
const energyBar = new THREE.Group();
root.add(spring, mass, energyBar);
registerComponent("spring", "Spring", spring, {});
registerComponent("mass", "Mass", mass, {});
registerComponent("energy-bar", "Energy Bar", energyBar, {});
registerControl({ id: "displacement", type: "range", label: "Displacement", min: -2, max: 2, step: 0.1, value: 0 }, function(value) {
  mass.position.x = value;
});
registerControl({ id: "extra", type: "toggle", label: "Extra", value: false }, function(value) {
  energyBar.visible = value;
});
setWalkthroughSteps([]);
`,
      components: [
        { id: "spring", label: "Spring" },
        { id: "mass", label: "Mass" },
        { id: "energy-bar", label: "Energy Bar" },
      ],
      walkthroughSteps: [],
    });

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) {
      expect(result.error).toContain("extra");
    }
  });
});
