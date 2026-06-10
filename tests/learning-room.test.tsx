import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LearningRoom } from "@/components/experience/LearningRoom";
import type { ArtifactRecord } from "@/lib/artifacts/artifactTypes";

const artifact: ArtifactRecord = {
  id: "artifact-aerobic-respiration",
  title: "Aerobic Respiration: From Glucose to ATP",
  topic: "Aerobic respiration",
  summary: "A guided 3D walkthrough of aerobic respiration.",
  lessonMode: "guided_walkthrough",
  sceneSource: "registerComponent('glucose', 'Glucose', root, {}); setWalkthroughSteps([]);",
  html: "<!doctype html><html><body>Artifact</body></html>",
  components: [{ id: "glucose", label: "Glucose" }],
  walkthroughSteps: [],
  createdAt: "2026-06-10T03:00:00.000Z",
};

const handlers = {
  onStopResponse: () => undefined,
  onExit: () => undefined,
  onResetSession: () => undefined,
  onLearningRoomMessage: () => undefined,
  onCommandsFlushed: () => undefined,
  onComponentSelected: () => undefined,
  onStepChanged: () => undefined,
  onArtifactError: () => undefined,
  onEnterExperience: () => undefined,
};

describe("LearningRoom", () => {
  it("renders the room chat header as Chat without tutor-channel or new-chat controls", () => {
    const html = renderToStaticMarkup(
      <LearningRoom
        artifact={artifact}
        messages={[]}
        artifacts={{ [artifact.id]: artifact }}
        trace={[]}
        pendingCommands={[]}
        selectedComponent={null}
        busy={false}
        {...handlers}
      />,
    );

    expect(html).toContain(">Chat</h2>");
    expect(html).not.toContain("Tutor channel");
    expect(html).not.toContain("Start new chat");
  });
});
