import { describe, expect, it } from "vitest";
import type { ArtifactRecord, ChatMessage } from "@/lib/artifacts/artifactTypes";
import { createSessionFromThread } from "@/lib/threads/threadSession";

const messages: ChatMessage[] = [
  { id: "message-1", role: "user", content: "Teach me jet engines", createdAt: "2026-06-09T14:00:00.000Z" },
  {
    id: "message-2",
    role: "assistant",
    content: "I built Jet Engine Explorer.",
    createdAt: "2026-06-09T14:01:00.000Z",
    artifactId: "artifact-1",
  },
];

const artifact: ArtifactRecord = {
  id: "artifact-1",
  title: "Jet Engine Explorer",
  topic: "jet engines",
  summary: "A guided turbofan room.",
  lessonMode: "guided_walkthrough",
  interactionGoal: "Trace airflow from the fan through the turbine.",
  controls: [{ id: "labels", type: "toggle", label: "Labels", value: true }],
  sceneSource: "const fan = new THREE.Group();",
  html: "<!doctype html><html><body>engine</body></html>",
  components: [
    { id: "fan", label: "Fan" },
    { id: "compressor", label: "Compressor" },
    { id: "turbine", label: "Turbine" },
  ],
  walkthroughSteps: [
    { id: "intro", title: "Intro", narration: "Start at the fan.", targetComponentIds: ["fan"] },
  ],
  createdAt: "2026-06-09T14:01:00.000Z",
};

describe("createSessionFromThread", () => {
  it("maps persisted thread messages and artifacts into the active LearningSession shape", () => {
    const session = createSessionFromThread({
      threadId: "thread-1",
      messages,
      artifacts: [artifact],
    });

    expect(session).toMatchObject({
      id: "thread-1",
      mode: "chat",
      messages,
      artifacts: { "artifact-1": artifact },
      activeArtifactId: null,
      lastArtifactId: "artifact-1",
      selectedComponent: null,
      activeStepId: null,
      pendingCommands: [],
      trace: [],
    });
    expect(session.artifacts["artifact-1"]?.lessonMode).toBe("guided_walkthrough");
    expect(session.artifacts["artifact-1"]?.controls?.[0]?.id).toBe("labels");
  });
});
