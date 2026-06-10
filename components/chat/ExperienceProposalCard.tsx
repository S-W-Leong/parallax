"use client";

import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { ArtifactRecord } from "@/lib/artifacts/artifactTypes";
import { learningOutcomesForArtifact } from "@/lib/artifacts/proposalCopy";

type ExperienceProposalCardProps = {
  artifact: ArtifactRecord;
  trace: string[];
  mode?: "full" | "compact";
  onEnterExperience: (artifactId: string) => void;
};

export function ExperienceProposalCard({ artifact, trace, mode = "full", onEnterExperience }: ExperienceProposalCardProps) {
  const outcomes = learningOutcomesForArtifact(artifact);

  if (mode === "compact") {
    return (
      <article className="proposal-row">
        <div>
          <p className="eyebrow">Experience ready</p>
          <h2>{artifact.title}</h2>
        </div>
        <button className="primary-action" onClick={() => onEnterExperience(artifact.id)}>
          Start <ArrowRight size={16} />
        </button>
      </article>
    );
  }

  return (
    <article className="proposal-card proposal-card-full">
      <div className="proposal-head">
        <div>
          <p className="eyebrow">Experience ready</p>
          <h2>{artifact.title}</h2>
        </div>
        <button className="primary-action" onClick={() => onEnterExperience(artifact.id)}>
          Start learning <ArrowRight size={16} />
        </button>
      </div>
      <p className="proposal-summary">{artifact.summary}</p>
      {outcomes.length ? (
        <ul className="learning-outcomes" aria-label="Learning outcomes">
          {outcomes.map((outcome) => (
            <li key={outcome}>
              <CheckCircle2 size={15} />
              <span>{outcome}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
