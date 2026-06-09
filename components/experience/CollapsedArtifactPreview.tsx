"use client";

import { ArrowRight, Box } from "lucide-react";
import type { ArtifactRecord } from "@/lib/artifacts/artifactTypes";

type CollapsedArtifactPreviewProps = {
  artifact: ArtifactRecord;
  onEnterExperience: (artifactId: string) => void;
};

export function CollapsedArtifactPreview({ artifact, onEnterExperience }: CollapsedArtifactPreviewProps) {
  return (
    <aside className="collapsed-preview">
      <div>
        <p className="eyebrow">
          <Box size={14} /> Last experience
        </p>
        <h2>{artifact.title}</h2>
      </div>
      <button className="primary-action" onClick={() => onEnterExperience(artifact.id)}>
        Reopen <ArrowRight size={16} />
      </button>
    </aside>
  );
}
