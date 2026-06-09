import { describe, expect, it } from "vitest";
import { encodeSession, parseStoredSession } from "@/lib/session/sessionStorage";
import { createEmptySession, sessionReducer } from "@/lib/session/sessionReducer";
import type { ArtifactRecord } from "@/lib/artifacts/artifactTypes";

const artifact: ArtifactRecord = {
  id: "artifact-1",
  title: "Inside a Cell",
  topic: "cells",
  summary: "A guided model of cell structures.",
  sceneSource: "registerComponent('a','A',root,{}); setWalkthroughSteps([]);",
  html: "<!doctype html><html><body>artifact</body></html>",
  components: [
    { id: "membrane", label: "Cell membrane" },
    { id: "nucleus", label: "Nucleus" },
    { id: "ribosome", label: "Ribosome" },
  ],
  walkthroughSteps: [
    { id: "intro", title: "Start", narration: "Begin at the membrane.", targetComponentIds: ["membrane"] },
  ],
  createdAt: "2026-06-09T13:00:00.000Z",
};

describe("session reducer", () => {
  it("creates a centered chat session by default", () => {
    expect(createEmptySession()).toMatchObject({
      mode: "chat",
      activeArtifactId: null,
      selectedComponent: null,
    });
  });

  it("adds an artifact proposal and enters the learning room from the same thread", () => {
    const withMessage = sessionReducer(createEmptySession(), { type: "user_message", content: "Teach me cells" });
    const withArtifact = sessionReducer(withMessage, { type: "artifact_created", artifact, trace: ["Validated artifact"] });
    const inRoom = sessionReducer(withArtifact, { type: "enter_experience", artifactId: artifact.id });

    expect(inRoom.mode).toBe("learning_room");
    expect(inRoom.activeArtifactId).toBe(artifact.id);
    expect(inRoom.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(inRoom.messages[1]).toMatchObject({ artifactId: artifact.id });
  });

  it("tracks selected components as visible chat events", () => {
    const inRoom = sessionReducer(
      sessionReducer(createEmptySession(), { type: "artifact_created", artifact, trace: [] }),
      { type: "enter_experience", artifactId: artifact.id },
    );

    const selected = sessionReducer(inRoom, {
      type: "component_selected",
      component: { artifactId: artifact.id, id: "nucleus", label: "Nucleus", metadata: { role: "DNA store" } },
    });

    expect(selected.selectedComponent).toMatchObject({ id: "nucleus", label: "Nucleus" });
    expect(selected.messages.at(-1)).toMatchObject({ role: "system", content: "Selected: Nucleus" });
  });

  it("tags tutor user messages with the active artifact", () => {
    const inRoom = sessionReducer(
      sessionReducer(createEmptySession(), { type: "artifact_created", artifact, trace: [] }),
      { type: "enter_experience", artifactId: artifact.id },
    );

    const withTutorQuestion = sessionReducer(inRoom, { type: "user_message", content: "Focus the nucleus" });

    expect(withTutorQuestion.messages.at(-1)).toMatchObject({
      role: "user",
      content: "Focus the nucleus",
      artifactId: artifact.id,
    });
  });

  it("returns to chat while retaining a collapsed artifact preview", () => {
    const inRoom = sessionReducer(
      sessionReducer(createEmptySession(), { type: "artifact_created", artifact, trace: [] }),
      { type: "enter_experience", artifactId: artifact.id },
    );
    const exited = sessionReducer(inRoom, { type: "exit_experience" });

    expect(exited.mode).toBe("chat");
    expect(exited.activeArtifactId).toBe(null);
    expect(exited.lastArtifactId).toBe(artifact.id);
  });

  it("resets persisted chat and artifact state to a fresh session", () => {
    const withArtifact = sessionReducer(createEmptySession(), { type: "artifact_created", artifact, trace: ["Validated artifact"] });
    const inRoom = sessionReducer(withArtifact, { type: "enter_experience", artifactId: artifact.id });
    const reset = sessionReducer(inRoom, { type: "reset_session" });

    expect(reset).toMatchObject({
      mode: "chat",
      messages: [],
      artifacts: {},
      activeArtifactId: null,
      lastArtifactId: null,
      selectedComponent: null,
      activeStepId: null,
      pendingCommands: [],
      trace: [],
    });
    expect(reset.id).not.toBe(inRoom.id);
  });

  it("replaces active state with a loaded persisted thread session", () => {
    const existing = sessionReducer(createEmptySession(), { type: "user_message", content: "Old local chat" });
    const loaded = {
      ...createEmptySession(),
      id: "thread-1",
      messages: [{ id: "message-1", role: "user" as const, content: "Persisted chat", createdAt: "2026-06-09T14:00:00.000Z" }],
    };

    const next = sessionReducer(existing, { type: "session_loaded", session: loaded });

    expect(next.id).toBe("thread-1");
    expect(next.messages).toHaveLength(1);
    expect(next.messages[0].content).toBe("Persisted chat");
  });

  it("round trips persisted session state", () => {
    const withMessage = sessionReducer(createEmptySession(), { type: "user_message", content: "Teach me CRISPR" });
    const encoded = encodeSession(withMessage);
    const restored = parseStoredSession(encoded);

    expect(restored.messages[0]).toMatchObject({ role: "user", content: "Teach me CRISPR" });
  });

  it("drops sessions from older storage versions", () => {
    const withMessage = sessionReducer(createEmptySession(), { type: "user_message", content: "Teach me CRISPR" });
    const legacy = JSON.stringify({ version: 1, ...withMessage });
    const restored = parseStoredSession(legacy);

    expect(restored.messages).toEqual([]);
    expect(restored.id).not.toBe(withMessage.id);
  });
});
