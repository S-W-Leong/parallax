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
});
