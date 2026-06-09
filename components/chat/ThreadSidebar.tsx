"use client";

import { Archive, MessageSquarePlus } from "lucide-react";
import type { PersistedThreadSummary } from "@/lib/cloud/threadRecords";

type ThreadSidebarProps = {
  threads: PersistedThreadSummary[];
  activeThreadId: string | null;
  onCreateThread: () => void;
  onSelectThread: (threadId: string) => void;
  onArchiveThread: (threadId: string) => void;
};

function formatThreadDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

export function ThreadSidebar({ threads, activeThreadId, onCreateThread, onSelectThread, onArchiveThread }: ThreadSidebarProps) {
  return (
    <aside className="thread-sidebar">
      <header>
        <div className="lab-mark">Parallax</div>
        <button className="icon-button" type="button" onClick={onCreateThread} aria-label="New chat" title="New chat">
          <MessageSquarePlus size={18} />
        </button>
      </header>
      <nav aria-label="Chat threads">
        {threads.map((thread) => {
          const isActive = thread.id === activeThreadId;
          return (
            <div className={isActive ? "thread-item active" : "thread-item"} key={thread.id}>
              <button type="button" onClick={() => onSelectThread(thread.id)} aria-current={isActive ? "page" : undefined}>
                <span>{thread.title}</span>
                <small>{formatThreadDate(thread.updatedAt)}</small>
              </button>
              <button
                className="icon-button"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onArchiveThread(thread.id);
                }}
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
