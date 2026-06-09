import { describe, expect, it } from "vitest";
import { learningOutcomesForArtifact } from "@/lib/artifacts/proposalCopy";
import type { ArtifactRecord } from "@/lib/artifacts/artifactTypes";

const baseArtifact: ArtifactRecord = {
  id: "artifact-1",
  title: "Jet Engine Lab",
  topic: "jet engines",
  summary: "Explore airflow, combustion, and thrust.",
  sceneSource: "registerComponent('a','A',root,{}); setWalkthroughSteps([{id:'s',title:'S',narration:'N',targetComponentIds:['a']}]);",
  html: "<!doctype html><html><body></body></html>",
  components: [
    { id: "fan", label: "Fan" },
    { id: "compressor", label: "Compressor" },
    { id: "combustor", label: "Combustor" },
  ],
  walkthroughSteps: [
    { id: "airflow", title: "Trace airflow", narration: "Follow air from intake to exhaust.", targetComponentIds: ["fan"] },
    { id: "heat", title: "Compare hot and cold zones", narration: "See where energy changes.", targetComponentIds: ["combustor"] },
    { id: "thrust", title: "See how thrust forms", narration: "Watch gases accelerate.", targetComponentIds: ["compressor"] },
  ],
  createdAt: "2026-06-10T00:00:00.000Z",
};

describe("learningOutcomesForArtifact", () => {
  it("uses explicit friendly learning outcomes first", () => {
    const outcomes = learningOutcomesForArtifact({
      ...baseArtifact,
      learningOutcomes: ["Trace airflow", "Compare hot and cold zones", "See how thrust forms"],
    });

    expect(outcomes).toEqual(["Trace airflow", "Compare hot and cold zones", "See how thrust forms"]);
  });

  it("falls back to walkthrough titles and limits the list to three", () => {
    expect(learningOutcomesForArtifact(baseArtifact)).toEqual([
      "Trace airflow",
      "Compare hot and cold zones",
      "See how thrust forms",
    ]);
  });
});
