"use client";

import { Archive, MessageSquare, MessageSquarePlus, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { PersistedThreadSummary } from "@/lib/cloud/threadRecords";

type ThreadSidebarProps = {
  threads: PersistedThreadSummary[];
  activeThreadId: string | null;
  pinned: boolean;
  actionsDisabled?: boolean;
  onTogglePinned: () => void;
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
  actionsDisabled = false,
  onTogglePinned,
  onCreateThread,
  onSelectThread,
  onArchiveThread,
}: ThreadSidebarProps) {
  return (
    <aside className={pinned ? "thread-sidebar is-pinned" : "thread-sidebar"}>
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
          <button className="icon-button" type="button" onClick={onCreateThread} disabled={actionsDisabled} aria-label="New chat" title="New chat">
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
                onClick={() => onSelectThread(thread.id)}
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
