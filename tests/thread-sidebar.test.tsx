import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ThreadSidebar } from "@/components/chat/ThreadSidebar";
import type { PersistedThreadSummary } from "@/lib/cloud/threadRecords";

const threads: PersistedThreadSummary[] = [
  {
    id: "thread-1",
    title: "Build a DNA room",
    createdAt: "2026-06-10T10:00:00.000Z",
    updatedAt: "2026-06-10T10:01:00.000Z",
  },
  {
    id: "thread-2",
    title: "Quiz me on cells",
    createdAt: "2026-06-10T09:00:00.000Z",
    updatedAt: "2026-06-10T09:02:00.000Z",
  },
];

describe("ThreadSidebar", () => {
  it("keeps thread selection available while create and archive actions are disabled", () => {
    const html = renderToStaticMarkup(
      <ThreadSidebar
        threads={threads}
        activeThreadId="thread-1"
        pinned={true}
        mobileOpen={false}
        actionsDisabled={true}
        onTogglePinned={vi.fn()}
        onCloseMobile={vi.fn()}
        onExpandedChange={vi.fn()}
        onCreateThread={vi.fn()}
        onSelectThread={vi.fn()}
        onArchiveThread={vi.fn()}
      />,
    );

    expect(html).toContain('aria-label="New chat"');
    expect(html).toContain('aria-label="Archive Build a DNA room"');
    expect(html).toContain('<button class="thread-select" type="button" aria-current="page" title="Build a DNA room">');
    expect(html).toContain('<button class="thread-select" type="button" title="Quiz me on cells">');
  });
});
