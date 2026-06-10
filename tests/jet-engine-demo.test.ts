import { describe, expect, it } from "vitest";
import { artifactRecordSchema } from "@/lib/artifacts/artifactTypes";
import { validateSceneSource } from "@/lib/artifacts/artifactValidator";
import {
  getJetEngineDemoTutorTurn,
  isJetEngineDemoArtifact,
  JET_ENGINE_DEMO_ARTIFACT,
  JET_ENGINE_DEMO_ARTIFACT_ID,
  JET_ENGINE_DEMO_ID,
  STARTER_PROMPTS,
} from "@/lib/demo/jetEngineDemo";

describe("jet engine demo", () => {
  it("marks only the first starter prompt as demo-triggered", () => {
    expect(STARTER_PROMPTS[0]).toEqual({
      id: "jet-engine-demo",
      label: "Tour a jet engine",
      demoId: JET_ENGINE_DEMO_ID,
    });
    expect(STARTER_PROMPTS.slice(1).map((prompt) => prompt.demoId)).toEqual([undefined, undefined, undefined]);
  });

  it("ships a valid guided walkthrough artifact", () => {
    expect(() => artifactRecordSchema.parse(JET_ENGINE_DEMO_ARTIFACT)).not.toThrow();
    expect(validateSceneSource(JET_ENGINE_DEMO_ARTIFACT.sceneSource)).toEqual({ ok: true });
    expect(JET_ENGINE_DEMO_ARTIFACT.lessonMode).toBe("guided_walkthrough");
    expect(JET_ENGINE_DEMO_ARTIFACT.controls).toBeUndefined();
  });

  it("uses the fixed component and walkthrough ids", () => {
    expect(JET_ENGINE_DEMO_ARTIFACT.components.map((component) => component.id)).toEqual([
      "fan",
      "compressor",
      "combustor",
      "turbine",
      "nozzle",
      "shaft",
      "airflow",
    ]);
    expect(JET_ENGINE_DEMO_ARTIFACT.walkthroughSteps.map((step) => step.id)).toEqual([
      "overview",
      "fan-inlet",
      "compressor",
      "combustor",
      "turbine",
      "nozzle",
    ]);
  });

  it("renders the artifact with the fixed runtime and title", () => {
    expect(JET_ENGINE_DEMO_ARTIFACT.html).toContain("/three/three.module.min.js");
    expect(JET_ENGINE_DEMO_ARTIFACT.html).toContain("Tour a Turbofan Jet Engine");
  });

  it("uses animated small particles for the airflow visualization", () => {
    expect(JET_ENGINE_DEMO_ARTIFACT.sceneSource).toContain("new THREE.Points");
    expect(JET_ENGINE_DEMO_ARTIFACT.sceneSource).toContain("airParticlePositions");
    expect(JET_ENGINE_DEMO_ARTIFACT.sceneSource).toContain("airflowParticles.onBeforeRender");
    expect(JET_ENGINE_DEMO_ARTIFACT.sceneSource).toContain("needsUpdate = true");
  });

  it("models a convincing cutaway turbofan with realistic visual details", () => {
    expect(JET_ENGINE_DEMO_ARTIFACT.sceneSource).toContain("spinnerCone");
    expect(JET_ENGINE_DEMO_ARTIFACT.sceneSource).toContain("frontFanBladeCount");
    expect(JET_ENGINE_DEMO_ARTIFACT.sceneSource).toContain("addBladeRow");
    expect(JET_ENGINE_DEMO_ARTIFACT.sceneSource).toContain("statorVane");
    expect(JET_ENGINE_DEMO_ARTIFACT.sceneSource).toContain("combustorGlow");
    expect(JET_ENGINE_DEMO_ARTIFACT.sceneSource).toContain("fuelInjector");
    expect(JET_ENGINE_DEMO_ARTIFACT.sceneSource).toContain("turbineBlade");
    expect(JET_ENGINE_DEMO_ARTIFACT.sceneSource).toContain("exhaustPlume");
    expect(JET_ENGINE_DEMO_ARTIFACT.sceneSource).toContain("cutawayRib");
  });

  it("rotates translated blade geometry around the shared engine axis", () => {
    expect(JET_ENGINE_DEMO_ARTIFACT.sceneSource).toContain("function translatedBladeGeometry");
    expect(JET_ENGINE_DEMO_ARTIFACT.sceneSource).toContain("geometry.translate(0, radialLength / 2, 0)");
    expect(JET_ENGINE_DEMO_ARTIFACT.sceneSource).toContain("blade.position.set(x, 0, 0)");
    expect(JET_ENGINE_DEMO_ARTIFACT.sceneSource).not.toContain("blade.position.y = radius");
    expect(JET_ENGINE_DEMO_ARTIFACT.sceneSource).not.toContain("blade.position.y = 0.78");
  });

  it("uses lathed engine profiles instead of floating rail geometry", () => {
    expect(JET_ENGINE_DEMO_ARTIFACT.sceneSource).toContain("function latheBody");
    expect(JET_ENGINE_DEMO_ARTIFACT.sceneSource).toContain("const centerX = (minX + maxX) / 2");
    expect(JET_ENGINE_DEMO_ARTIFACT.sceneSource).toContain("mesh.position.x = centerX");
    expect(JET_ENGINE_DEMO_ARTIFACT.sceneSource).toContain("nacelleProfile");
    expect(JET_ENGINE_DEMO_ARTIFACT.sceneSource).toContain("coreSkin");
    expect(JET_ENGINE_DEMO_ARTIFACT.sceneSource).toContain("nozzleProfile");
    expect(JET_ENGINE_DEMO_ARTIFACT.sceneSource).not.toContain("lowerCutawayPanel");
    expect(JET_ENGINE_DEMO_ARTIFACT.sceneSource).not.toContain("topCutawayRail");
  });

  it("offsets the airflow label away from the shaft label", () => {
    expect(JET_ENGINE_DEMO_ARTIFACT.sceneSource).toContain("labelOffset: [0, -0.45, 0]");
  });

  it("recognizes only the fixed demo artifact id", () => {
    expect(isJetEngineDemoArtifact(JET_ENGINE_DEMO_ARTIFACT)).toBe(true);
    expect(isJetEngineDemoArtifact(null)).toBe(false);
    expect(isJetEngineDemoArtifact({ ...JET_ENGINE_DEMO_ARTIFACT, id: `${JET_ENGINE_DEMO_ARTIFACT_ID}-changed` })).toBe(false);
  });

  it("maps simple tutor requests to artifact commands", () => {
    expect(getJetEngineDemoTutorTurn("show the combustor").commands).toEqual([
      { type: "focus_component", componentId: "combustor" },
      { type: "go_to_step", stepId: "combustor" },
    ]);
    expect(getJetEngineDemoTutorTurn("explode the view").commands).toEqual([{ type: "explode" }]);
    expect(getJetEngineDemoTutorTurn("reset camera").commands).toEqual([{ type: "reset_camera" }]);
    expect(getJetEngineDemoTutorTurn("walkthrough please").commands).toEqual([{ type: "start_walkthrough" }]);

    const fallback = getJetEngineDemoTutorTurn("what am I looking at?");
    expect(fallback.content).toContain("Air enters through the fan");
    expect(fallback.commands).toEqual([]);
  });
});
