import type { PersistedThreadSummary } from "@/lib/cloud/threadRecords";

export function sortThreadSummariesByRecentUpdate(threads: PersistedThreadSummary[]): PersistedThreadSummary[] {
  return [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
