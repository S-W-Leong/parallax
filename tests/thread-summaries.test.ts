import { describe, expect, it } from "vitest";
import { sortThreadSummariesByRecentUpdate } from "@/lib/session/threadSummaries";
import type { PersistedThreadSummary } from "@/lib/cloud/threadRecords";

describe("thread summary helpers", () => {
  it("keeps refreshed thread summaries ordered by newest update", () => {
    const summaries: PersistedThreadSummary[] = [
      {
        id: "thread-old-title",
        title: "New chat",
        createdAt: "2026-06-10T09:00:00.000Z",
        updatedAt: "2026-06-10T09:00:00.000Z",
      },
      {
        id: "thread-existing",
        title: "Elastic Potential Energy",
        createdAt: "2026-06-10T08:00:00.000Z",
        updatedAt: "2026-06-10T08:30:00.000Z",
      },
      {
        id: "thread-refreshed",
        title: "DNA Replication Lab",
        createdAt: "2026-06-10T10:00:00.000Z",
        updatedAt: "2026-06-10T10:04:00.000Z",
      },
    ];

    expect(sortThreadSummariesByRecentUpdate(summaries).map((thread) => thread.id)).toEqual([
      "thread-refreshed",
      "thread-old-title",
      "thread-existing",
    ]);
  });
});
