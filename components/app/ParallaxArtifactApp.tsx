"use client";

import { useMemo, useState } from "react";
import { Activity, Box, CheckCircle2, Cpu, FileCode, GraduationCap, History, LayoutDashboard, MessageSquare, ShieldCheck } from "lucide-react";
import type { ArtifactCommand, ArtifactRecord, SelectedComponent } from "@/lib/artifacts/artifactTypes";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatThread } from "@/components/chat/ChatThread";
import { CollapsedArtifactPreview } from "@/components/experience/CollapsedArtifactPreview";
import { LearningRoom } from "@/components/experience/LearningRoom";
import { usePersistentSession } from "@/lib/session/usePersistentSession";

type ChatAgentResponse = {
  message: string;
  trace: string[];
  artifact: ArtifactRecord | null;
  error: string | null;
};

type TutorAgentResponse = {
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
  const [state, dispatch, hydrated] = usePersistentSession();
  const [busy, setBusy] = useState(false);
  const activeArtifact = state.activeArtifactId ? state.artifacts[state.activeArtifactId] : null;
  const lastArtifact = state.lastArtifactId ? state.artifacts[state.lastArtifactId] : null;
  const artifacts = useMemo(() => Object.values(state.artifacts).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [state.artifacts]);
  const chatShellClass = useMemo(() => (lastArtifact ? "chat-shell has-preview" : "chat-shell"), [lastArtifact]);

  async function sendChatMessage(message: string) {
    dispatch({ type: "user_message", content: message });
    setBusy(true);
    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, messages: state.messages }),
      });
      const data = await readJson<ChatAgentResponse>(response);
      if (data.artifact) {
        dispatch({ type: "artifact_created", artifact: data.artifact, trace: data.trace, message: data.message });
      } else {
        dispatch({ type: "assistant_message", content: data.message });
        if (data.error) dispatch({ type: "system_event", content: data.error });
      }
    } catch (error) {
      dispatch({ type: "system_event", content: error instanceof Error ? error.message : "Unknown chat agent error" });
    } finally {
      setBusy(false);
    }
  }

  async function sendTutorMessage(message: string) {
    if (!activeArtifact) return;
    dispatch({ type: "user_message", content: message });
    setBusy(true);
    try {
      const response = await fetch("/api/agent/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          artifact: activeArtifact,
          messages: state.messages,
          selectedComponent: state.selectedComponent,
          activeStepId: state.activeStepId,
        }),
      });
      const data = await readJson<TutorAgentResponse>(response);
      dispatch({ type: "assistant_message", content: data.message, artifactId: activeArtifact.id });
      if (data.commands.length) dispatch({ type: "enqueue_commands", commands: data.commands });
    } catch (error) {
      dispatch({ type: "system_event", content: error instanceof Error ? error.message : "Unknown tutor agent error", artifactId: activeArtifact.id });
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
        onExit={() => dispatch({ type: "exit_experience" })}
        onTutorMessage={sendTutorMessage}
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
      <aside className="app-sidebar">
        <div className="brand-block">
          <div className="brand-mark">PX</div>
          <div>
            <p className="eyebrow">Agentic STEM lab</p>
            <h1>Parallax</h1>
          </div>
        </div>

        <nav className="side-nav" aria-label="Primary">
          <a className="active" href="#console">
            <LayoutDashboard size={16} /> Console
          </a>
          <a href="#rooms">
            <GraduationCap size={16} /> Learning Rooms
          </a>
          <a href="#artifacts">
            <Box size={16} /> Artifacts
          </a>
          <a href="#logs">
            <FileCode size={16} /> Tutor Logs
          </a>
          <a href="#checks">
            <ShieldCheck size={16} /> System Checks
          </a>
        </nav>

        <div className="sidebar-status">
          <p className="eyebrow">Session</p>
          <div className="status-line">
            <span>Runtime</span>
            <strong>{busy ? "WORKING" : "READY"}</strong>
          </div>
          <div className="status-line">
            <span>Artifacts</span>
            <strong>{artifacts.length}</strong>
          </div>
          <div className="status-line">
            <span>Messages</span>
            <strong>{state.messages.length}</strong>
          </div>
        </div>
      </aside>

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
            <ChatComposer disabled={busy} placeholder="Ask to learn any STEM topic" onSubmit={sendChatMessage} />
            <div className="prompt-grid">
              {["Explain a fusion reactor", "Build a neuron synapse", "Show orbital resonance", "Model DNA replication"].map((prompt) => (
                <button className="prompt-chip" key={prompt} type="button" onClick={() => sendChatMessage(prompt)} disabled={busy}>
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
