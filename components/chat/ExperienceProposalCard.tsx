"use client";

import { ArrowRight, Box, ListChecks } from "lucide-react";
import type { ArtifactRecord } from "@/lib/artifacts/artifactTypes";

type ExperienceProposalCardProps = {
  artifact: ArtifactRecord;
  trace: string[];
  mode?: "full" | "compact";
  onEnterExperience: (artifactId: string) => void;
};

export function ExperienceProposalCard({ artifact, trace, mode = "full", onEnterExperience }: ExperienceProposalCardProps) {
  return (
    <article className={`proposal-card proposal-card-${mode}`}>
      <div className="proposal-head">
        <div>
          <p className="eyebrow">Experience ready</p>
          <h2>{artifact.title}</h2>
        </div>
        <button className="primary-action" onClick={() => onEnterExperience(artifact.id)}>
          Enter Experience <ArrowRight size={16} />
        </button>
      </div>
      <p className="proposal-summary">{artifact.summary}</p>
      <div className="proposal-grid">
        <section>
          <h3>
            <Box size={15} /> Components
          </h3>
          <div className="chip-row">
            {artifact.components.map((component) => (
              <span className="chip" key={component.id}>
                {component.label}
              </span>
            ))}
          </div>
        </section>
        <section>
          <h3>
            <ListChecks size={15} /> Walkthrough
          </h3>
          <ol className="step-list">
            {artifact.walkthroughSteps.map((step) => (
              <li key={step.id}>{step.title}</li>
            ))}
          </ol>
        </section>
      </div>
      {trace.length > 0 ? (
        <div className="trace-row">
          {trace.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
