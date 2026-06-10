"use client";

import { useRef, useState } from "react";
import { Menu } from "lucide-react";
import type { ArtifactCommand, ArtifactRecord, SelectedComponent } from "@/lib/artifacts/artifactTypes";
import { decodeAgentStreamEvents, type AgentStreamEvent } from "@/lib/agent/streamProtocol";
import { ParallaxLogo } from "@/components/brand/ParallaxLogo";
import { ChatHome } from "@/components/app/ChatHome";
import { ThreadSidebar } from "@/components/chat/ThreadSidebar";
import { LearningRoom } from "@/components/experience/LearningRoom";
import { useThreadSession } from "@/lib/session/useThreadSession";

type PendingRequest = {
  id: string;
  draftId: string;
  controller: AbortController;
};

type AppShellClassOptions = {
  sidebarExpanded: boolean;
  learning: boolean;
};

export function getAppShellClassName({ sidebarExpanded, learning }: AppShellClassOptions): string {
  return ["app-shell", sidebarExpanded ? "sidebar-pinned" : "", learning ? "is-learning" : ""].filter(Boolean).join(" ");
}

function makeClientId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function ParallaxArtifactApp() {
  const { userId, activeThreadId, threads, state, dispatch, hydrated, createThread, selectThread, archiveThread, refreshThreads } =
    useThreadSession();
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null);
  const [sidebarPinned, setSidebarPinned] = useState(false);
  const [sidebarHoverExpanded, setSidebarHoverExpanded] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const pendingRequestRef = useRef<PendingRequest | null>(null);
  const busy = Boolean(pendingRequest);
  const activeArtifact = state.activeArtifactId ? state.artifacts[state.activeArtifactId] : null;
  const sidebarExpanded = sidebarPinned || sidebarHoverExpanded;

  function stopResponse() {
    const activeRequest = pendingRequestRef.current;
    if (!activeRequest) return;
    activeRequest.controller.abort();
    dispatch({ type: "assistant_draft_stopped", id: activeRequest.draftId });
    pendingRequestRef.current = null;
    setPendingRequest(null);
  }

  function processStreamEvent(
    event: AgentStreamEvent,
    draftId: string,
    artifactId: string | undefined,
    streamState: { hasDelta: boolean; errorShown: boolean },
  ) {
    if (event.type === "status") {
      if (!streamState.hasDelta) {
        dispatch({ type: "assistant_draft_replaced", id: draftId, content: event.message });
      }
      return;
    }

    if (event.type === "delta") {
      if (!streamState.hasDelta) {
        streamState.hasDelta = true;
        dispatch({ type: "assistant_draft_replaced", id: draftId, content: event.delta });
      } else {
        dispatch({ type: "assistant_draft_delta", id: draftId, delta: event.delta });
      }
      return;
    }

    if (event.type === "error") {
      streamState.errorShown = true;
      dispatch({ type: "system_event", content: event.message, artifactId });
      return;
    }

    if (event.error) {
      const errorContent = event.message || event.error;
      if (!streamState.errorShown) {
        streamState.errorShown = true;
        dispatch({ type: "system_event", content: event.error, artifactId });
      }
      dispatch({ type: "assistant_draft_completed", id: draftId, content: errorContent, artifactId });
      return;
    }

    if (event.artifact) {
      dispatch({ type: "artifact_attached_to_message", id: draftId, artifact: event.artifact, trace: event.trace, content: event.message });
    } else {
      dispatch({ type: "assistant_draft_completed", id: draftId, content: event.message, artifactId });
    }

    if (event.commands.length) {
      dispatch({ type: "enqueue_commands", commands: event.commands });
    }
  }

  async function readAgentStream(response: Response, draftId: string, artifactId: string | undefined, signal: AbortSignal) {
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
      throw new Error(data?.error ?? data?.message ?? response.statusText);
    }
    if (!response.body) throw new Error("Agent stream did not include a response body.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const streamState = { hasDelta: false, errorShown: false };

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lastBoundary = buffer.lastIndexOf("\n\n");
        if (lastBoundary === -1) continue;

        const completeBlocks = buffer.slice(0, lastBoundary + 2);
        buffer = buffer.slice(lastBoundary + 2);
        for (const event of decodeAgentStreamEvents(completeBlocks)) {
          processStreamEvent(event, draftId, artifactId, streamState);
        }
      }

      buffer += decoder.decode();
      if (buffer.trim() && !signal.aborted) {
        for (const event of decodeAgentStreamEvents(buffer)) {
          processStreamEvent(event, draftId, artifactId, streamState);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async function streamAgentMessage(options: {
    message: string;
    mode: "chat" | "learning_room";
    body: Record<string, unknown>;
    artifactId?: string;
    initialDraft: string;
  }) {
    if (pendingRequestRef.current) return;

    const requestId = makeClientId("request");
    const draftId = makeClientId("draft");
    const controller = new AbortController();

    dispatch({ type: "user_message", content: options.message });
    dispatch({ type: "assistant_draft_started", id: draftId, content: options.initialDraft, artifactId: options.artifactId });
    const request = { id: requestId, draftId, controller };
    pendingRequestRef.current = request;
    setPendingRequest(request);

    function clearCurrentRequest() {
      if (pendingRequestRef.current?.id === requestId) {
        pendingRequestRef.current = null;
      }
      setPendingRequest((current) => {
        if (current?.id !== requestId) return current;
        return null;
      });
    }

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ ...options.body, mode: options.mode, stream: true }),
        signal: controller.signal,
      });
      await readAgentStream(response, draftId, options.artifactId, controller.signal);
      clearCurrentRequest();
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) {
        dispatch({ type: "assistant_draft_stopped", id: draftId });
      } else {
        dispatch({ type: "assistant_draft_stopped", id: draftId });
        dispatch({
          type: "system_event",
          content: error instanceof Error ? error.message : "Unknown agent error",
          artifactId: options.artifactId,
        });
      }
    } finally {
      clearCurrentRequest();
    }
  }

  async function sendChatMessage(message: string) {
    await streamAgentMessage({
      message,
      mode: "chat",
      initialDraft: "Let me think this through...",
      body: { threadId: activeThreadId, userId, message, messages: state.messages },
    });
  }

  async function sendLearningRoomMessage(message: string) {
    if (!activeArtifact) return;
    await streamAgentMessage({
      message,
      mode: "learning_room",
      artifactId: activeArtifact.id,
      initialDraft: "Thinking...",
      body: {
        threadId: activeThreadId,
        userId,
        message,
        artifact: activeArtifact,
        messages: state.messages,
        selectedComponent: state.selectedComponent,
        activeStepId: state.activeStepId,
      },
    });
  }

  function enterExperience(artifactId: string) {
    dispatch({ type: "enter_experience", artifactId });
  }

  function selectComponent(component: SelectedComponent) {
    dispatch({ type: "component_selected", component });
  }

  function resetSession() {
    if (pendingRequestRef.current) return;
    void createThread();
  }

  function createThreadIfIdle() {
    if (pendingRequestRef.current) return;
    void createThread();
  }

  function selectThreadIfIdle(threadId: string) {
    if (pendingRequestRef.current) stopResponse();
    void selectThread(threadId);
  }

  function archiveThreadIfIdle(threadId: string) {
    if (pendingRequestRef.current) return;
    void archiveThread(threadId);
  }

  if (!hydrated) {
    return (
      <main className="lab-shell">
        <section className="boot-panel">
          <div className="lab-mark">
            <ParallaxLogo className="parallax-logo" />
            <span>Parallax</span>
          </div>
          <p className="eyebrow">Session restore</p>
        </section>
      </main>
    );
  }

  if (state.mode === "learning_room" && activeArtifact) {
    return (
      <main className={getAppShellClassName({ sidebarExpanded, learning: true })}>
        <ThreadSidebar
          threads={threads}
          activeThreadId={activeThreadId}
          pinned={sidebarPinned}
          mobileOpen={mobileSidebarOpen}
          actionsDisabled={busy}
          onTogglePinned={() => setSidebarPinned((value) => !value)}
          onExpandedChange={setSidebarHoverExpanded}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          onCreateThread={createThreadIfIdle}
          onSelectThread={selectThreadIfIdle}
          onArchiveThread={archiveThreadIfIdle}
        />
        <button className="mobile-sidebar-button icon-button" type="button" onClick={() => setMobileSidebarOpen(true)} aria-label="Open chats">
          <Menu size={18} />
        </button>

        <LearningRoom
          artifact={activeArtifact}
          messages={state.messages}
          artifacts={state.artifacts}
          trace={state.trace}
          pendingCommands={state.pendingCommands}
          selectedComponent={state.selectedComponent}
          busy={busy}
          onStop={stopResponse}
          onStopResponse={stopResponse}
          onExit={() => dispatch({ type: "exit_experience" })}
          onResetSession={resetSession}
          onLearningRoomMessage={sendLearningRoomMessage}
          onCommandsFlushed={() => dispatch({ type: "clear_pending_commands" })}
          onComponentSelected={selectComponent}
          onStepChanged={(stepId, title) => dispatch({ type: "step_changed", stepId, title })}
          onArtifactError={(message) => dispatch({ type: "artifact_error", message })}
          onEnterExperience={enterExperience}
        />
      </main>
    );
  }

  return (
    <main className={getAppShellClassName({ sidebarExpanded, learning: false })}>
      <ThreadSidebar
        threads={threads}
        activeThreadId={activeThreadId}
        pinned={sidebarPinned}
        mobileOpen={mobileSidebarOpen}
        actionsDisabled={busy}
        onTogglePinned={() => setSidebarPinned((value) => !value)}
        onExpandedChange={setSidebarHoverExpanded}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        onCreateThread={createThreadIfIdle}
        onSelectThread={selectThreadIfIdle}
        onArchiveThread={archiveThreadIfIdle}
      />
      <button className="mobile-sidebar-button icon-button" type="button" onClick={() => setMobileSidebarOpen(true)} aria-label="Open chats">
        <Menu size={18} />
      </button>

      <ChatHome
        messages={state.messages}
        artifacts={state.artifacts}
        trace={state.trace}
        busy={busy}
        onSendMessage={sendChatMessage}
        onStop={stopResponse}
        onEnterExperience={enterExperience}
      />
    </main>
  );
}
