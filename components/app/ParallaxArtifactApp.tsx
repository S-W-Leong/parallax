"use client";

import { useRef, useState } from "react";
import { Menu } from "lucide-react";
import type { ArtifactRecord, SelectedComponent } from "@/lib/artifacts/artifactTypes";
import { decodeAgentStreamEvents, type AgentStreamEvent } from "@/lib/agent/streamProtocol";
import { ParallaxLogo } from "@/components/brand/ParallaxLogo";
import { ChatHome } from "@/components/app/ChatHome";
import { ThreadSidebar } from "@/components/chat/ThreadSidebar";
import { LearningRoom } from "@/components/experience/LearningRoom";
import type { SessionAction } from "@/lib/session/sessionReducer";
import { useThreadSession } from "@/lib/session/useThreadSession";

type PendingRequest = {
  id: string;
  threadId: string;
  draftId: string;
  controller: AbortController;
};

type PendingRequestsByThreadId = Record<string, PendingRequest>;

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
  const {
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
  } = useThreadSession();
  const [pendingRequestsByThreadId, setPendingRequestsByThreadId] = useState<PendingRequestsByThreadId>({});
  const [sidebarPinned, setSidebarPinned] = useState(false);
  const [sidebarHoverExpanded, setSidebarHoverExpanded] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const pendingRequestsRef = useRef<PendingRequestsByThreadId>({});
  const activePendingRequest = activeThreadId ? pendingRequestsByThreadId[activeThreadId] : null;
  const busy = Boolean(activePendingRequest);
  const runningThreadIds = new Set(Object.keys(pendingRequestsByThreadId));
  const activeArtifact = state.activeArtifactId ? state.artifacts[state.activeArtifactId] : null;
  const sidebarExpanded = sidebarPinned || sidebarHoverExpanded;

  function storePendingRequest(request: PendingRequest) {
    const next = { ...pendingRequestsRef.current, [request.threadId]: request };
    pendingRequestsRef.current = next;
    setPendingRequestsByThreadId(next);
  }

  function clearPendingRequest(threadId: string, requestId: string) {
    const activeRequest = pendingRequestsRef.current[threadId];
    if (activeRequest?.id !== requestId) return;
    const { [threadId]: _removed, ...next } = pendingRequestsRef.current;
    pendingRequestsRef.current = next;
    setPendingRequestsByThreadId(next);
  }

  function stopThreadResponse(threadId: string) {
    const activeRequest = pendingRequestsRef.current[threadId];
    if (!activeRequest) return;
    activeRequest.controller.abort();
    dispatchToThread(threadId, { type: "assistant_draft_stopped", id: activeRequest.draftId });
    clearPendingRequest(threadId, activeRequest.id);
  }

  function stopResponse() {
    if (!activeThreadId) return;
    stopThreadResponse(activeThreadId);
  }

  function processStreamEvent(
    event: AgentStreamEvent,
    draftId: string,
    artifactId: string | undefined,
    streamState: { hasDelta: boolean; errorShown: boolean },
    dispatchAction: (action: SessionAction) => void,
  ) {
    if (event.type === "status") {
      if (!streamState.hasDelta) {
        dispatchAction({ type: "assistant_draft_replaced", id: draftId, content: event.message });
      }
      return;
    }

    if (event.type === "delta") {
      if (!streamState.hasDelta) {
        streamState.hasDelta = true;
        dispatchAction({ type: "assistant_draft_replaced", id: draftId, content: event.delta });
      } else {
        dispatchAction({ type: "assistant_draft_delta", id: draftId, delta: event.delta });
      }
      return;
    }

    if (event.type === "trace") {
      dispatchAction({ type: "assistant_trace_event", id: draftId, entry: event.entry });
      return;
    }

    if (event.type === "error") {
      streamState.errorShown = true;
      dispatchAction({ type: "system_event", content: event.message, artifactId });
      return;
    }

    if (event.error) {
      const errorContent = event.message || event.error;
      if (!streamState.errorShown) {
        streamState.errorShown = true;
        dispatchAction({ type: "system_event", content: event.error, artifactId });
      }
      dispatchAction({ type: "assistant_draft_completed", id: draftId, content: errorContent, artifactId });
      return;
    }

    if (event.artifact) {
      dispatchAction({ type: "artifact_attached_to_message", id: draftId, artifact: event.artifact, trace: event.trace, content: event.message });
    } else {
      dispatchAction({ type: "assistant_draft_completed", id: draftId, content: event.message, artifactId });
    }

    if (event.commands.length) {
      dispatchAction({ type: "enqueue_commands", commands: event.commands });
    }
  }

  async function readAgentStream(response: Response, threadId: string, draftId: string, artifactId: string | undefined, signal: AbortSignal) {
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
          processStreamEvent(event, draftId, artifactId, streamState, (action) => dispatchToThread(threadId, action));
        }
      }

      buffer += decoder.decode();
      if (buffer.trim() && !signal.aborted) {
        for (const event of decodeAgentStreamEvents(buffer)) {
          processStreamEvent(event, draftId, artifactId, streamState, (action) => dispatchToThread(threadId, action));
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async function streamAgentMessage(options: {
    threadId: string;
    message: string;
    mode: "chat" | "learning_room";
    body: Record<string, unknown>;
    artifactId?: string;
    initialDraft: string;
  }) {
    if (pendingRequestsRef.current[options.threadId]) return;

    const requestId = makeClientId("request");
    const draftId = makeClientId("draft");
    const controller = new AbortController();

    dispatchToThread(options.threadId, { type: "user_message", content: options.message });
    dispatchToThread(options.threadId, {
      type: "assistant_draft_started",
      id: draftId,
      content: options.initialDraft,
      artifactId: options.artifactId,
    });
    storePendingRequest({ id: requestId, threadId: options.threadId, draftId, controller });

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ ...options.body, mode: options.mode, stream: true }),
        signal: controller.signal,
      });
      await readAgentStream(response, options.threadId, draftId, options.artifactId, controller.signal);
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) {
        dispatchToThread(options.threadId, { type: "assistant_draft_stopped", id: draftId });
      } else {
        dispatchToThread(options.threadId, { type: "assistant_draft_stopped", id: draftId });
        dispatchToThread(options.threadId, {
          type: "system_event",
          content: error instanceof Error ? error.message : "Unknown agent error",
          artifactId: options.artifactId,
        });
      }
    } finally {
      clearPendingRequest(options.threadId, requestId);
      void refreshThreads();
    }
  }

  async function sendChatMessage(message: string) {
    if (!activeThreadId) return;
    const threadId = activeThreadId;
    const activeSession = getThreadSession(threadId) ?? state;
    await streamAgentMessage({
      threadId,
      message,
      mode: "chat",
      initialDraft: "Let me think this through...",
      body: {
        threadId,
        userId,
        message,
        messages: activeSession.messages,
        artifacts: activeSession.artifacts,
        activeArtifactId: activeSession.activeArtifactId,
        lastArtifactId: activeSession.lastArtifactId,
      },
    });
  }

  async function sendLearningRoomMessage(message: string) {
    if (!activeArtifact || !activeThreadId) return;
    const threadId = activeThreadId;
    const activeSession = getThreadSession(threadId) ?? state;
    await streamAgentMessage({
      threadId,
      message,
      mode: "learning_room",
      artifactId: activeArtifact.id,
      initialDraft: "Thinking...",
      body: {
        threadId,
        userId,
        message,
        artifact: activeArtifact,
        messages: activeSession.messages,
        selectedComponent: activeSession.selectedComponent,
        activeStepId: activeSession.activeStepId,
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
    void createThread();
  }

  function createThreadIfIdle() {
    void createThread();
  }

  function selectThreadIfIdle(threadId: string) {
    void selectThread(threadId);
  }

  function archiveThreadIfIdle(threadId: string) {
    if (pendingRequestsRef.current[threadId]) return;
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
          runningThreadIds={runningThreadIds}
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
        runningThreadIds={runningThreadIds}
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
