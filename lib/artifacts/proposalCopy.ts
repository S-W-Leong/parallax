import type { ArtifactRecord } from "./artifactTypes";

function clean(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function learningOutcomesForArtifact(artifact: ArtifactRecord): string[] {
  const explicit = unique((artifact.learningOutcomes ?? []).map(clean).filter(Boolean)).slice(0, 3);
  if (explicit.length) return explicit;

  const walkthrough = unique(artifact.walkthroughSteps.map((step) => clean(step.title)).filter(Boolean)).slice(0, 3);
  if (walkthrough.length >= 3) return walkthrough;

  const componentOutcomes = artifact.components
    .map((component) => `Explore ${clean(component.label).toLowerCase()}`)
    .filter((value) => value.length > "Explore ".length);

  return unique([...walkthrough, ...componentOutcomes]).slice(0, 3);
}
