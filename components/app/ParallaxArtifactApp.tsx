"use client";

import { useMemo, useState } from "react";
import type { ArtifactCommand, ArtifactRecord, SelectedComponent } from "@/lib/artifacts/artifactTypes";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatThread } from "@/components/chat/ChatThread";
import { ThreadSidebar } from "@/components/chat/ThreadSidebar";
import { CollapsedArtifactPreview } from "@/components/experience/CollapsedArtifactPreview";
import { LearningRoom } from "@/components/experience/LearningRoom";
import { useThreadSession } from "@/lib/session/useThreadSession";

type ChatAgentResponse = {
  message: string;
  trace: string[];
  artifact: ArtifactRecord | null;
  error: string | null;
};

type LearningRoomAgentResponse = {
  message: string;
  commands: ArtifactCommand[];
};

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => null)) as T | null;
  if (!response.ok) {
    const maybeError = data as { error?: string; message?: string } | null;
    throw new Error(maybeError?.error ?? maybeError?.message ?? response.statusText);
  }
  if (!data) throw new Error("Empty agent response");
  return data;
}

export function ParallaxArtifactApp() {
  const { userId, activeThreadId, threads, state, dispatch, hydrated, createThread, selectThread, archiveThread } = useThreadSession();
  const [busy, setBusy] = useState(false);
  const activeArtifact = state.activeArtifactId ? state.artifacts[state.activeArtifactId] : null;
  const lastArtifact = state.lastArtifactId ? state.artifacts[state.lastArtifactId] : null;
  const chatShellClass = useMemo(() => (lastArtifact ? "chat-shell has-preview" : "chat-shell"), [lastArtifact]);

  async function sendChatMessage(message: string) {
    dispatch({ type: "user_message", content: message });
    setBusy(true);
    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "chat", threadId: activeThreadId, userId, message, messages: state.messages }),
      });
      const data = await readJson<ChatAgentResponse>(response);
      if (data.artifact) {
        dispatch({ type: "artifact_created", artifact: data.artifact, trace: data.trace, message: data.message });
      } else {
        dispatch({ type: "assistant_message", content: data.message });
        if (data.error) dispatch({ type: "system_event", content: data.error });
      }
    } catch (error) {
      dispatch({ type: "system_event", content: error instanceof Error ? error.message : "Unknown agent error" });
    } finally {
      setBusy(false);
    }
  }

  async function sendLearningRoomMessage(message: string) {
    if (!activeArtifact) return;
    dispatch({ type: "user_message", content: message });
    setBusy(true);
    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "learning_room",
          threadId: activeThreadId,
          userId,
          message,
          artifact: activeArtifact,
          messages: state.messages,
          selectedComponent: state.selectedComponent,
          activeStepId: state.activeStepId,
        }),
      });
      const data = await readJson<LearningRoomAgentResponse>(response);
      dispatch({ type: "assistant_message", content: data.message, artifactId: activeArtifact.id });
      if (data.commands.length) dispatch({ type: "enqueue_commands", commands: data.commands });
    } catch (error) {
      dispatch({ type: "system_event", content: error instanceof Error ? error.message : "Unknown learning-room agent error", artifactId: activeArtifact.id });
    } finally {
      setBusy(false);
    }
  }

  function enterExperience(artifactId: string) {
    dispatch({ type: "enter_experience", artifactId });
  }

  function selectComponent(component: SelectedComponent) {
    dispatch({ type: "component_selected", component });
  }

  function resetSession() {
    void createThread();
  }

  if (!hydrated) {
    return (
      <main className="lab-shell">
        <section className="chat-home">
          <div className="lab-mark">Parallax</div>
        </section>
      </main>
    );
  }

  if (state.mode === "learning_room" && activeArtifact) {
    return (
      <LearningRoom
        artifact={activeArtifact}
        messages={state.messages}
        artifacts={state.artifacts}
        trace={state.trace}
        pendingCommands={state.pendingCommands}
        selectedComponent={state.selectedComponent}
        busy={busy}
        onExit={() => dispatch({ type: "exit_experience" })}
        onResetSession={resetSession}
        onLearningRoomMessage={sendLearningRoomMessage}
        onCommandsFlushed={() => dispatch({ type: "clear_pending_commands" })}
        onComponentSelected={selectComponent}
        onStepChanged={(stepId, title) => dispatch({ type: "step_changed", stepId, title })}
        onArtifactError={(message) => dispatch({ type: "artifact_error", message })}
        onEnterExperience={enterExperience}
      />
    );
  }

  return (
    <main className="threaded-app-shell">
      <ThreadSidebar
        threads={threads}
        activeThreadId={activeThreadId}
        onCreateThread={() => void createThread()}
        onSelectThread={(threadId) => void selectThread(threadId)}
        onArchiveThread={(threadId) => void archiveThread(threadId)}
      />
      <section className={chatShellClass}>
        <header className="app-header">
          <div className="lab-mark">Parallax</div>
        </header>
        <ChatThread messages={state.messages} artifacts={state.artifacts} trace={state.trace} onEnterExperience={enterExperience} />
        {lastArtifact ? <CollapsedArtifactPreview artifact={lastArtifact} onEnterExperience={enterExperience} /> : null}
        <ChatComposer disabled={busy} placeholder="Ask to learn any STEM topic" onSubmit={sendChatMessage} />
      </section>
    </main>
  );
}
