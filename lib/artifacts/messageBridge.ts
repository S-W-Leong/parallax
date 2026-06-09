import {
  artifactEventSchema,
  parentArtifactMessageSchema,
  type ArtifactCommand,
  type ArtifactEvent,
  type ParentArtifactMessage,
} from "./artifactTypes";

export type { ArtifactCommand, ArtifactEvent, ParentArtifactMessage };

export function parseArtifactEvent(data: unknown): ArtifactEvent | null {
  const result = artifactEventSchema.safeParse(data);
  return result.success ? result.data : null;
}

export function buildParentArtifactMessage(artifactId: string, command: ArtifactCommand): ParentArtifactMessage {
  return {
    source: "parallax-parent",
    type: "artifact_command",
    artifactId,
    command,
  };
}

export function parseParentArtifactMessage(data: unknown): ParentArtifactMessage | null {
  const result = parentArtifactMessageSchema.safeParse(data);
  return result.success ? result.data : null;
}
