"use client";

import { useMemo, useState } from "react";
import { Activity, CheckCircle2, Cpu, History, MessageSquare } from "lucide-react";
import type { ArtifactCommand, ArtifactRecord, SelectedComponent } from "@/lib/artifacts/artifactTypes";
import { decodeAgentStreamEvents, type AgentStreamEvent } from "@/lib/agent/streamProtocol";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatThread } from "@/components/chat/ChatThread";
import { ThreadSidebar } from "@/components/chat/ThreadSidebar";
import { CollapsedArtifactPreview } from "@/components/experience/CollapsedArtifactPreview";
import { LearningRoom } from "@/components/experience/LearningRoom";
import { useThreadSession } from "@/lib/session/useThreadSession";

type PendingRequest = {
  id: string;
  draftId: string;
  controller: AbortController;
};

function makeClientId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function ParallaxArtifactApp() {
  const { userId, activeThreadId, threads, state, dispatch, hydrated, createThread, selectThread, archiveThread } = useThreadSession();
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null);
  const busy = Boolean(pendingRequest);
  const activeArtifact = state.activeArtifactId ? state.artifacts[state.activeArtifactId] : null;
  const lastArtifact = state.lastArtifactId ? state.artifacts[state.lastArtifactId] : null;
  const artifacts = useMemo(() => Object.values(state.artifacts).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [state.artifacts]);
  const chatShellClass = useMemo(() => (lastArtifact ? "chat-shell has-preview" : "chat-shell"), [lastArtifact]);

  function stopResponse() {
    if (!pendingRequest) return;
    pendingRequest.controller.abort();
    dispatch({ type: "assistant_draft_stopped", id: pendingRequest.draftId });
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
      if (!streamState.errorShown) {
        streamState.errorShown = true;
        dispatch({ type: "system_event", content: event.error, artifactId });
      }
      dispatch({ type: "assistant_draft_stopped", id: draftId });
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
    if (busy) return;

    const requestId = makeClientId("request");
    const draftId = makeClientId("draft");
    const controller = new AbortController();

    dispatch({ type: "user_message", content: options.message });
    dispatch({ type: "assistant_draft_started", id: draftId, content: options.initialDraft, artifactId: options.artifactId });
    setPendingRequest({ id: requestId, draftId, controller });

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ ...options.body, mode: options.mode, stream: true }),
        signal: controller.signal,
      });
      await readAgentStream(response, draftId, options.artifactId, controller.signal);
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
      setPendingRequest((current) => (current?.id === requestId ? null : current));
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
    void createThread();
  }

  if (!hydrated) {
    return (
      <main className="lab-shell">
        <section className="boot-panel">
          <div className="lab-mark">Parallax</div>
          <p className="eyebrow">Session restore</p>
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
    );
  }

  return (
    <main className="app-shell">
      <ThreadSidebar
        threads={threads}
        activeThreadId={activeThreadId}
        onCreateThread={() => void createThread()}
        onSelectThread={(threadId) => void selectThread(threadId)}
        onArchiveThread={(threadId) => void archiveThread(threadId)}
      />

      <section className="console-main" id="console">
        <header className="topbar">
          <div>
            <p className="eyebrow">Interactive generation console</p>
            <h2>3D Learning Room Builder</h2>
          </div>
          <div className="topbar-actions">
            <span className="pill accent">SANDBOXED</span>
            <span className="pill">3D RUNTIME</span>
          </div>
        </header>

        <div className="console-grid">
          <section className="hero-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Topic intake</p>
                <h3>What should we build into 3D?</h3>
              </div>
              <span className="metric-badge">{busy ? "AGENT ACTIVE" : "READY"}</span>
            </div>
            <ChatComposer disabled={false} pending={busy} placeholder="Ask to learn any STEM topic" onStop={stopResponse} onSubmit={sendChatMessage} />
             <div className="prompt-grid">
               {["Explain a fusion reactor", "Build a neuron synapse", "Show orbital resonance", "Model DNA replication"].map((prompt) => (
                 <button className="prompt-chip" key={prompt} type="button" onClick={() => void sendChatMessage(prompt)} disabled={busy}>
                   {prompt}
                 </button>
               ))}
            </div>
          </section>

          <section className={chatShellClass}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Conversation / proposals</p>
                <h3>Agent Output</h3>
              </div>
              <MessageSquare size={18} />
            </div>
            <ChatThread messages={state.messages} artifacts={state.artifacts} trace={state.trace} onEnterExperience={enterExperience} />
            {lastArtifact ? <CollapsedArtifactPreview artifact={lastArtifact} onEnterExperience={enterExperience} /> : null}
          </section>

          <aside className="right-rail">
            <section className="metric-panel">
              <div className="metric-card">
                <p className="eyebrow">Generated rooms</p>
                <strong>{artifacts.length}</strong>
              </div>
              <div className="metric-card">
                <p className="eyebrow">Trace events</p>
                <strong>{state.trace.length}</strong>
              </div>
            </section>

            <section className="dashboard-panel">
              <div className="panel-heading compact">
                <p className="eyebrow">
                  <Activity size={14} /> Agent Trace
                </p>
                <span className="pill">LOG</span>
              </div>
              <div className="log-list">
                {(state.trace.length ? state.trace : ["topic parser idle", "scene compiler idle", "validator standing by"]).map((item) => (
                  <div className="log-row" key={item}>
                    <CheckCircle2 size={14} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="dashboard-panel" id="rooms">
              <div className="panel-heading compact">
                <p className="eyebrow">
                  <History size={14} /> Recent Rooms
                </p>
              </div>
              <div className="room-list">
                {(artifacts.length ? artifacts.slice(0, 4) : []).map((artifact) => (
                  <button className="room-row" key={artifact.id} onClick={() => enterExperience(artifact.id)}>
                    <span>{artifact.title}</span>
                    <small>{artifact.components.length} components</small>
                  </button>
                ))}
                {!artifacts.length ? <p className="muted tight">Generated learning rooms will appear here.</p> : null}
              </div>
            </section>

            <section className="dashboard-panel" id="checks">
              <div className="panel-heading compact">
                <p className="eyebrow">
                  <Cpu size={14} /> System Checks
                </p>
              </div>
              <div className="check-grid">
                <span>Iframe sandbox</span>
                <strong>ON</strong>
                <span>Three runtime</span>
                <strong>LOCAL</strong>
                <span>Tutor agent</span>
                <strong>{busy ? "BUSY" : "READY"}</strong>
              </div>
            </section>
           </aside>
         </div>
      </section>
    </main>
  );
}
