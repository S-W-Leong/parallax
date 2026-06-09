import type { ArtifactRecord, ChatMessage, LearningSession } from "@/lib/artifacts/artifactTypes";

export function createSessionFromThread(input: {
  threadId: string;
  messages: ChatMessage[];
  artifacts: ArtifactRecord[];
}): LearningSession {
  const artifacts = Object.fromEntries(input.artifacts.map((artifact) => [artifact.id, artifact]));
  const lastArtifactId = [...input.messages].reverse().find((message) => message.artifactId)?.artifactId ?? null;

  return {
    id: input.threadId,
    mode: "chat",
    messages: input.messages,
    artifacts,
    activeArtifactId: null,
    lastArtifactId,
    selectedComponent: null,
    activeStepId: null,
    pendingCommands: [],
    trace: [],
  };
}
