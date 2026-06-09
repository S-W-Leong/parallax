import { describe, expect, it } from "vitest";
import { buildParentArtifactMessage, parseArtifactEvent, parseParentArtifactMessage } from "@/lib/artifacts/messageBridge";

describe("artifact message bridge", () => {
  it("parses component selection events from the artifact iframe", () => {
    const event = parseArtifactEvent({
      source: "parallax-artifact",
      type: "component_selected",
      artifactId: "artifact-1",
      componentId: "compressor",
      label: "Compressor",
      metadata: { stage: 2 },
    });

    expect(event).toMatchObject({
      type: "component_selected",
      artifactId: "artifact-1",
      componentId: "compressor",
      label: "Compressor",
    });
  });

  it("ignores unrelated postMessage payloads", () => {
    expect(parseArtifactEvent({ type: "component_selected", artifactId: "artifact-1" })).toBeNull();
    expect(parseArtifactEvent("hello")).toBeNull();
  });

  it("builds and parses parent commands for the artifact iframe", () => {
    const message = buildParentArtifactMessage("artifact-1", { type: "focus_component", componentId: "nucleus" });
    expect(parseParentArtifactMessage(message)).toEqual(message);
  });
});
