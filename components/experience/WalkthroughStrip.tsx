"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { WalkthroughStep } from "@/lib/artifacts/artifactTypes";

type WalkthroughStripProps = {
  steps: WalkthroughStep[];
  activeStepId: string | null;
  onPrevious: () => void;
  onNext: () => void;
};

export function WalkthroughStrip({ steps, activeStepId, onPrevious, onNext }: WalkthroughStripProps) {
  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === activeStepId),
  );
  const activeStep = steps[activeIndex] ?? steps[0] ?? null;
  const hasSteps = steps.length > 0;

  return (
    <section className="walkthrough-strip" aria-label="Walkthrough step controls">
      <button className="icon-button" type="button" onClick={onPrevious} disabled={!hasSteps || activeIndex <= 0} aria-label="Previous step">
        <ChevronLeft size={18} />
      </button>
      <div className="walkthrough-strip-copy">
        <span className="walkthrough-count">{hasSteps ? `${activeIndex + 1} / ${steps.length}` : "0 / 0"}</span>
        <strong>{activeStep?.title ?? "No walkthrough steps"}</strong>
        {activeStep?.narration ? <p>{activeStep.narration}</p> : null}
      </div>
      <button
        className="icon-button"
        type="button"
        onClick={onNext}
        disabled={!hasSteps || activeIndex >= steps.length - 1}
        aria-label="Next step"
      >
        <ChevronRight size={18} />
      </button>
    </section>
  );
}
