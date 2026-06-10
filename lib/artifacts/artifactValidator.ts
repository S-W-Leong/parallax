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
const forbiddenGeneratedLabelPatterns = [
  /\bfillText\s*\(/i,
  /\bstrokeText\s*\(/i,
  /\bmeasureText\s*\(/i,
  /\bTextGeometry\b/i,
  /\bFontLoader\b/i,
];

function stripLineAndBlockComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^\\:])\/\/.*$/gm, "$1");
}

function collectRegisteredControlIds(source: string): Set<string> {
  const registeredIds = new Set<string>();
  const commentStrippedSource = stripLineAndBlockComments(source);
  const patterns = [
    /registerControl\s*\(\s*\{\s*[\s\S]*?\bid\s*:\s*["'`]([^"'`]+)["'`]/g,
    /registerControl\s*\(\s*["'`]([^"'`]+)["'`]/g,
  ];

  for (const pattern of patterns) {
    for (const match of commentStrippedSource.matchAll(pattern)) {
      const id = match[1]?.trim();
      if (id) {
        registeredIds.add(id);
      }
    }
  }

  return registeredIds;
}

function syntaxErrorMessage(source: string): string | null {
  try {
    new Function(
      "THREE",
      "scene",
      "camera",
      "renderer",
      "root",
      "controls",
      "registerComponent",
      "registerControl",
      "setWalkthroughSteps",
      "setStatus",
      "fitCameraTo",
      source,
    );
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

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

  if (forbiddenGeneratedLabelPatterns.some((pattern) => pattern.test(source))) {
    return {
      ok: false,
      error: "Generated scene source must not create its own text labels; use registerComponent labels and the runtime labels toggle instead.",
    };
  }

  if (!/registerComponent\s*\(/.test(source)) {
    return { ok: false, error: "Generated scene source must call registerComponent." };
  }

  if (!/setWalkthroughSteps\s*\(/.test(source)) {
    return { ok: false, error: "Generated scene source must call setWalkthroughSteps." };
  }

  const syntaxError = syntaxErrorMessage(source);
  if (syntaxError) {
    return { ok: false, error: `Generated scene source has invalid JavaScript syntax: ${syntaxError}` };
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

  if (parsed.data.lessonMode === "playground") {
    if (parsed.data.walkthroughSteps.length > 0) {
      return {
        ok: false,
        error: "Playground artifacts must not declare walkthrough steps.",
      };
    }

    if (!parsed.data.controls?.length) {
      return {
        ok: false,
        error: "Playground artifacts must declare at least one control.",
      };
    }

    if (!/registerControl\s*\(/.test(parsed.data.sceneSource)) {
      return {
        ok: false,
        error: "Playground scene source must call registerControl.",
      };
    }
  }

  if (parsed.data.lessonMode === "guided_walkthrough" && parsed.data.walkthroughSteps.length === 0) {
    return {
      ok: false,
      error: "Guided walkthrough artifacts must include at least one step.",
    };
  }

  if (parsed.data.lessonMode === "guided_walkthrough" && (parsed.data.controls?.length ?? 0) > 0) {
    return {
      ok: false,
      error: "Guided walkthrough artifacts must not declare controls.",
    };
  }

  if (parsed.data.lessonMode === "guided_walkthrough" && /registerControl\s*\(/.test(parsed.data.sceneSource)) {
    return {
      ok: false,
      error: "Guided walkthrough scene source must not call registerControl.",
    };
  }

  const missingComponentIds = parsed.data.components
    .map((component) => component.id)
    .filter((id) => !parsed.data.sceneSource.includes(id));
  if (missingComponentIds.length) {
    return {
      ok: false,
      error: `Generated scene source does not reference declared component ids: ${missingComponentIds.join(", ")}`,
    };
  }

  const registeredControlIds = collectRegisteredControlIds(parsed.data.sceneSource);
  const missingControlIds = parsed.data.controls
    ?.map((control) => control.id)
    .filter((id) => !registeredControlIds.has(id));
  if (missingControlIds?.length) {
    return {
      ok: false,
      error: `Generated scene source does not reference declared control ids: ${missingControlIds.join(", ")}`,
    };
  }

  const declaredControlIds = new Set(parsed.data.controls?.map((control) => control.id) ?? []);
  const extraRegisteredControlIds = Array.from(registeredControlIds)
    .filter((id) => !declaredControlIds.has(id));
  if (extraRegisteredControlIds.length) {
    return {
      ok: false,
      error: `Generated scene source registers undeclared control ids: ${extraRegisteredControlIds.join(", ")}`,
    };
  }

  const id = makeArtifactId(parsed.data.topic);
  const artifact: ArtifactRecord = {
    ...parsed.data,
    id,
    html: renderArtifactHtml({ ...parsed.data, id }),
    createdAt: new Date().toISOString(),
  };

  return { ok: true, artifact };
}
