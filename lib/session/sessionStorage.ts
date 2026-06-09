import { z } from "zod";
import { learningSessionSchema, type LearningSession } from "@/lib/artifacts/artifactTypes";
import { createEmptySession } from "./sessionReducer";

const STORAGE_VERSION = 1;

const storedSessionSchema = learningSessionSchema.extend({
  version: z.number().optional(),
});

export const SESSION_STORAGE_KEY = "parallax.agentsArtifact.session.v1";

export function encodeSession(session: LearningSession): string {
  return JSON.stringify({ version: STORAGE_VERSION, ...session });
}

export function parseStoredSession(raw: string | null): LearningSession {
  if (!raw) return createEmptySession();
  try {
    const parsed = JSON.parse(raw);
    const result = storedSessionSchema.safeParse(parsed);
    if (!result.success) return createEmptySession();
    const { version: _version, ...session } = result.data;
    return session;
  } catch {
    return createEmptySession();
  }
}
