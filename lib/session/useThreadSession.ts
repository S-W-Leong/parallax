"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch } from "react";
import type { LearningSession } from "@/lib/artifacts/artifactTypes";
import type { PersistedThreadSummary } from "@/lib/cloud/threadRecords";
import { getDemoUserId } from "@/lib/demo/demoUser";
import { createEmptySession, sessionReducer, type SessionAction } from "./sessionReducer";
import { sortThreadSummariesByRecentUpdate } from "./threadSummaries";

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

function createEmptyThreadSession(threadId: string): LearningSession {
  return { ...createEmptySession(), id: threadId };
}

export function useThreadSession(): {
  userId: string | null;
  activeThreadId: string | null;
  threads: PersistedThreadSummary[];
  state: LearningSession;
  dispatch: Dispatch<SessionAction>;
  dispatchToThread: (threadId: string, action: SessionAction) => void;
  getThreadSession: (threadId: string) => LearningSession | null;
  hydrated: boolean;
  createThread: () => Promise<void>;
  selectThread: (threadId: string) => Promise<void>;
  archiveThread: (threadId: string) => Promise<void>;
  refreshThreads: () => Promise<void>;
} {
  const [hydrated, setHydrated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<PersistedThreadSummary[]>([]);
  const [sessionsByThreadId, setSessionsByThreadId] = useState<Record<string, LearningSession>>({});
  const activeThreadIdRef = useRef<string | null>(null);
  const sessionsByThreadIdRef = useRef<Record<string, LearningSession>>({});
  const emptySessionRef = useRef(createEmptySession());

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    sessionsByThreadIdRef.current = sessionsByThreadId;
  }, [sessionsByThreadId]);

  const setThreadSession = useCallback((threadId: string, session: LearningSession) => {
    setSessionsByThreadId((current) => {
      const next = { ...current, [threadId]: session };
      sessionsByThreadIdRef.current = next;
      return next;
    });
  }, []);

  const dispatchToThread = useCallback((threadId: string, action: SessionAction) => {
    setSessionsByThreadId((current) => {
      const existing = current[threadId] ?? createEmptyThreadSession(threadId);
      const next = { ...current, [threadId]: sessionReducer(existing, action) };
      sessionsByThreadIdRef.current = next;
      return next;
    });
  }, []);

  const dispatch = useCallback<Dispatch<SessionAction>>(
    (action) => {
      const threadId = activeThreadIdRef.current;
      if (!threadId) return;
      dispatchToThread(threadId, action);
    },
    [dispatchToThread],
  );

  const getThreadSession = useCallback((threadId: string): LearningSession | null => {
    return sessionsByThreadIdRef.current[threadId] ?? null;
  }, []);

  const state = activeThreadId ? sessionsByThreadId[activeThreadId] ?? createEmptyThreadSession(activeThreadId) : emptySessionRef.current;

  const loadThreadForUser = useCallback(async (nextUserId: string | null, threadId: string) => {
    if (!nextUserId) return;

    if (sessionsByThreadIdRef.current[threadId]) {
      activeThreadIdRef.current = threadId;
      setActiveThreadId(threadId);
      return;
    }

    const data = await readJson<LoadThreadResponse>(
      await fetch(`/api/threads/${encodeURIComponent(threadId)}?userId=${encodeURIComponent(nextUserId)}`),
    );
    setThreadSession(threadId, data.session);
    activeThreadIdRef.current = threadId;
    setActiveThreadId(threadId);
  }, [setThreadSession]);

  const refreshThreads = useCallback(async () => {
    if (!userId) return;

    const data = await readJson<ThreadListResponse>(await fetch(`/api/threads?userId=${encodeURIComponent(userId)}`));
    setThreads(sortThreadSummariesByRecentUpdate(data.threads));
  }, [userId]);

  useEffect(() => {
    let active = true;

    async function loadInitialThread() {
      const nextUserId = getDemoUserId();
      if (!nextUserId) return;

      setUserId(nextUserId);
      try {
        const data = await readJson<ThreadListResponse>(await fetch(`/api/threads?userId=${encodeURIComponent(nextUserId)}`));
        if (!active) return;

        const sortedThreads = sortThreadSummariesByRecentUpdate(data.threads);
        setThreads(sortedThreads);
        if (sortedThreads[0]) {
          await loadThreadForUser(nextUserId, sortedThreads[0].id);
        } else {
          const thread = await createThreadForUser(nextUserId);
          if (!active) return;
          const session = createEmptyThreadSession(thread.id);
          setThreads([thread]);
          activeThreadIdRef.current = thread.id;
          setActiveThreadId(thread.id);
          setThreadSession(thread.id, session);
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
    const session = createEmptyThreadSession(thread.id);
    setThreads((current) => sortThreadSummariesByRecentUpdate([thread, ...current]));
    activeThreadIdRef.current = thread.id;
    setActiveThreadId(thread.id);
    setThreadSession(thread.id, session);
  }, [setThreadSession, userId]);

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
      const remainingThreads = threads.filter((thread) => thread.id !== threadId);
      setThreads(remainingThreads);
      setSessionsByThreadId((current) => {
        const { [threadId]: _removed, ...remainingSessions } = current;
        sessionsByThreadIdRef.current = remainingSessions;
        return remainingSessions;
      });
      if (activeThreadId === threadId) {
        const nextThread = remainingThreads[0];
        if (nextThread) {
          await loadThreadForUser(userId, nextThread.id);
        } else {
          const thread = await createThreadForUser(userId);
          const session = createEmptyThreadSession(thread.id);
          setThreads([thread]);
          activeThreadIdRef.current = thread.id;
          setActiveThreadId(thread.id);
          setThreadSession(thread.id, session);
        }
      }
    },
    [activeThreadId, loadThreadForUser, setThreadSession, threads, userId],
  );

  return {
    userId,
    activeThreadId,
    threads,
    state,
    dispatch,
    dispatchToThread,
    getThreadSession,
    hydrated,
    createThread,
    selectThread,
    archiveThread,
    refreshThreads,
  };
}
