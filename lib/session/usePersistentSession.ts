"use client";

import { useEffect, useReducer, useState } from "react";
import type { LearningSession } from "@/lib/artifacts/artifactTypes";
import { createEmptySession, sessionReducer, type SessionAction } from "./sessionReducer";
import { encodeSession, parseStoredSession, SESSION_STORAGE_KEY } from "./sessionStorage";

function initialSession(): LearningSession {
  if (typeof window === "undefined") return createEmptySession();
  return parseStoredSession(window.localStorage.getItem(SESSION_STORAGE_KEY));
}

export function usePersistentSession(): [LearningSession, React.Dispatch<SessionAction>, boolean] {
  const [hydrated, setHydrated] = useState(false);
  const [state, dispatch] = useReducer(sessionReducer, undefined, initialSession);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(SESSION_STORAGE_KEY, encodeSession(state));
  }, [hydrated, state]);

  return [state, dispatch, hydrated];
}
