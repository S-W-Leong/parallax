"use client";

import { useCallback, useEffect, useReducer, useState, type Dispatch } from "react";
import type { LearningSession } from "@/lib/artifacts/artifactTypes";
import type { PersistedThreadSummary } from "@/lib/cloud/threadRecords";
import { getDemoUserId } from "@/lib/demo/demoUser";
import { createEmptySession, sessionReducer, type SessionAction } from "./sessionReducer";

type ThreadListResponse = { threads: PersistedThreadSummary[] };
type CreateThreadResponse = { thread: PersistedThreadSummary };
type LoadThreadResponse = { session: LearningSession };

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || !data) throw new Error("Thread API request failed");
  return data;
}

async function assertOk(response: Response): Promise<void> {
  if (!response.ok) throw new Error("Thread API request failed");
}

async function createThreadForUser(userId: string): Promise<PersistedThreadSummary> {
  const data = await readJson<CreateThreadResponse>(
    await fetch("/api/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, title: "New chat" }),
    }),
  );

  return data.thread;
}

export function useThreadSession(): {
  userId: string | null;
  activeThreadId: string | null;
  threads: PersistedThreadSummary[];
  state: LearningSession;
  dispatch: Dispatch<SessionAction>;
  hydrated: boolean;
  createThread: () => Promise<void>;
  selectThread: (threadId: string) => Promise<void>;
  archiveThread: (threadId: string) => Promise<void>;
} {
  const [hydrated, setHydrated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<PersistedThreadSummary[]>([]);
  const [state, dispatch] = useReducer(sessionReducer, undefined, createEmptySession);

  const loadThreadForUser = useCallback(async (nextUserId: string | null, threadId: string) => {
    if (!nextUserId) return;

    const data = await readJson<LoadThreadResponse>(
      await fetch(`/api/threads/${encodeURIComponent(threadId)}?userId=${encodeURIComponent(nextUserId)}`),
    );
    setActiveThreadId(threadId);
    dispatch({ type: "session_loaded", session: data.session });
  }, []);

  useEffect(() => {
    let active = true;

    async function loadInitialThread() {
      const nextUserId = getDemoUserId();
      if (!nextUserId) return;

      setUserId(nextUserId);
      try {
        const data = await readJson<ThreadListResponse>(await fetch(`/api/threads?userId=${encodeURIComponent(nextUserId)}`));
        if (!active) return;

        setThreads(data.threads);
        if (data.threads[0]) {
          await loadThreadForUser(nextUserId, data.threads[0].id);
        } else {
          const thread = await createThreadForUser(nextUserId);
          if (!active) return;
          setThreads([thread]);
          setActiveThreadId(thread.id);
          dispatch({ type: "session_loaded", session: { ...createEmptySession(), id: thread.id } });
        }
      } finally {
        if (active) setHydrated(true);
      }
    }

    loadInitialThread();

    return () => {
      active = false;
    };
  }, [loadThreadForUser]);

  const createThread = useCallback(async () => {
    if (!userId) return;

    const thread = await createThreadForUser(userId);
    setThreads((current) => [thread, ...current]);
    setActiveThreadId(thread.id);
    dispatch({ type: "session_loaded", session: { ...createEmptySession(), id: thread.id } });
  }, [userId]);

  const selectThread = useCallback(
    async (threadId: string) => {
      await loadThreadForUser(userId, threadId);
    },
    [loadThreadForUser, userId],
  );

  const archiveThread = useCallback(
    async (threadId: string) => {
      if (!userId) return;

      await assertOk(
        await fetch(`/api/threads/${encodeURIComponent(threadId)}?userId=${encodeURIComponent(userId)}`, {
          method: "DELETE",
        }),
      );
      setThreads((current) => current.filter((thread) => thread.id !== threadId));
      if (activeThreadId === threadId) {
        setActiveThreadId(null);
        dispatch({ type: "reset_session" });
      }
    },
    [activeThreadId, userId],
  );

  return { userId, activeThreadId, threads, state, dispatch, hydrated, createThread, selectThread, archiveThread };
}
