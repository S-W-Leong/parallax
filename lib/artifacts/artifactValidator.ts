import { renderArtifactHtml } from "./artifactTemplate";
import { createExperienceInputSchema, type ArtifactRecord, type CreateExperienceInput } from "./artifactTypes";

export type ArtifactValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export type CreateArtifactRecordResult =
  | { ok: true; artifact: ArtifactRecord }
  | { ok: false; error: string };

const forbiddenMarkup = ["<script", "<iframe", "srcdoc=", "<object", "<embed"];
const forbiddenNetworkPatterns = [
  /\bfetch\s*\(/i,
  /\bXMLHttpRequest\b/i,
  /\bWebSocket\b/i,
  /\bEventSource\b/i,
  /\bnavigator\.sendBeacon\b/i,
  /\bimport\s*\(/i,
];

function makeArtifactId(topic: string): string {
  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "topic";
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `artifact-${slug}-${random}`;
}

export function validateSceneSource(source: string): ArtifactValidationResult {
  const lower = source.toLowerCase();

  if (source.trim().length < 80) {
    return { ok: false, error: "Generated scene source is too short to be a complete artifact." };
  }

  if (source.length > 70000) {
    return { ok: false, error: "Generated scene source is too large for the artifact sandbox." };
  }

  const markup = forbiddenMarkup.find((token) => lower.includes(token));
  if (markup) {
    return { ok: false, error: `Generated scene source contains forbidden markup: ${markup}` };
  }

  if (forbiddenNetworkPatterns.some((pattern) => pattern.test(source))) {
    return { ok: false, error: "Generated scene source contains a forbidden network or dynamic import API." };
  }

  const registeredComponents = source.match(/registerComponent\s*\(/g)?.length ?? 0;
  if (registeredComponents < 3) {
    return { ok: false, error: "Generated scene source must call registerComponent at least three times." };
  }

  if (!/setWalkthroughSteps\s*\(/.test(source)) {
    return { ok: false, error: "Generated scene source must call setWalkthroughSteps." };
  }

  return { ok: true };
}

export function createArtifactRecord(input: CreateExperienceInput): CreateArtifactRecordResult {
  const parsed = createExperienceInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join("; ") };
  }

  const validation = validateSceneSource(parsed.data.sceneSource);
  if (!validation.ok) return validation;

  const id = makeArtifactId(parsed.data.topic);
  const artifact: ArtifactRecord = {
    ...parsed.data,
    id,
    html: renderArtifactHtml({ ...parsed.data, id }),
    createdAt: new Date().toISOString(),
  };

  return { ok: true, artifact };
}
