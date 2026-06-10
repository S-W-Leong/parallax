"use client";

import { Archive, MessageSquare, MessageSquarePlus, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { PersistedThreadSummary } from "@/lib/cloud/threadRecords";

type ThreadSidebarProps = {
  threads: PersistedThreadSummary[];
  activeThreadId: string | null;
  pinned: boolean;
  mobileOpen: boolean;
  actionsDisabled?: boolean;
  onTogglePinned: () => void;
  onCloseMobile: () => void;
  onCreateThread: () => void;
  onSelectThread: (threadId: string) => void;
  onArchiveThread: (threadId: string) => void;
};

function formatThreadDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

export function ThreadSidebar({
  threads,
  activeThreadId,
  pinned,
  mobileOpen,
  actionsDisabled = false,
  onTogglePinned,
  onCloseMobile,
  onCreateThread,
  onSelectThread,
  onArchiveThread,
}: ThreadSidebarProps) {
  const sidebarClass = ["thread-sidebar", pinned ? "is-pinned" : "", mobileOpen ? "is-mobile-open" : ""].filter(Boolean).join(" ");

  return (
    <aside className={sidebarClass}>
      <header>
        <div className="rail-brand">
          <span className="rail-logo" aria-hidden="true">
            P
          </span>
          <span className="rail-label">Parallax</span>
        </div>
        <div className="rail-actions">
          <button
            className="icon-button"
            type="button"
            onClick={onTogglePinned}
            aria-label={pinned ? "Collapse sidebar" : "Pin sidebar open"}
            title={pinned ? "Collapse sidebar" : "Pin sidebar open"}
          >
            {pinned ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => {
              onCreateThread();
              onCloseMobile();
            }}
            disabled={actionsDisabled}
            aria-label="New chat"
            title="New chat"
          >
            <MessageSquarePlus size={18} />
          </button>
        </div>
      </header>
      <nav aria-label="Chat threads">
        {threads.map((thread) => {
          const isActive = thread.id === activeThreadId;
          return (
            <div className={isActive ? "thread-item active" : "thread-item"} key={thread.id}>
              <button
                className="thread-select"
                type="button"
                onClick={() => {
                  onSelectThread(thread.id);
                  onCloseMobile();
                }}
                disabled={actionsDisabled}
                aria-current={isActive ? "page" : undefined}
                title={thread.title}
              >
                <MessageSquare className="thread-icon" size={17} aria-hidden="true" />
                <span className="thread-labels">
                  <span>{thread.title}</span>
                  <small>{formatThreadDate(thread.updatedAt)}</small>
                </span>
              </button>
              <button
                className="icon-button archive-thread-button"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onArchiveThread(thread.id);
                  onCloseMobile();
                }}
                disabled={actionsDisabled}
                aria-label={`Archive ${thread.title}`}
                title="Archive"
              >
                <Archive size={15} />
              </button>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
