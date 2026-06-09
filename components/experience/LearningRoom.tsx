"use client";

import { Braces, CheckCircle2, Crosshair, ListChecks, LogOut, MessageSquare, RotateCcw } from "lucide-react";
import type { ArtifactRecord, ChatMessage, SelectedComponent } from "@/lib/artifacts/artifactTypes";
import type { ArtifactCommand } from "@/lib/artifacts/messageBridge";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatThread } from "@/components/chat/ChatThread";
import { ArtifactFrame } from "./ArtifactFrame";

type LearningRoomProps = {
  artifact: ArtifactRecord;
  messages: ChatMessage[];
  artifacts: Record<string, ArtifactRecord>;
  trace: string[];
  pendingCommands: ArtifactCommand[];
  selectedComponent: SelectedComponent | null;
  busy: boolean;
  onExit: () => void;
  onTutorMessage: (message: string) => void;
  onCommandsFlushed: () => void;
  onComponentSelected: (component: SelectedComponent) => void;
  onStepChanged: (stepId: string, title: string) => void;
  onArtifactError: (message: string) => void;
  onEnterExperience: (artifactId: string) => void;
};

export function LearningRoom({
  artifact,
  messages,
  artifacts,
  trace,
  pendingCommands,
  selectedComponent,
  busy,
  onExit,
  onTutorMessage,
  onCommandsFlushed,
  onComponentSelected,
  onStepChanged,
  onArtifactError,
  onEnterExperience,
}: LearningRoomProps) {
  const selectedMetadata = selectedComponent?.metadata ? Object.entries(selectedComponent.metadata) : [];
  const roomMessages = messages.filter((message) => message.artifactId === artifact.id);

  return (
    <main className="learning-room">
      <section className="room-main">
        <header className="room-topbar">
          <div>
            <p className="eyebrow">Learning room / sandboxed artifact</p>
            <h1>{artifact.title}</h1>
          </div>
          <div className="topbar-actions">
            <span className="pill accent">VALIDATED</span>
            <span className="pill">COMPONENTS {artifact.components.length}</span>
            <button className="icon-button" onClick={onExit} aria-label="Exit experience">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <div className="room-workspace">
          <ArtifactFrame
            artifact={artifact}
            pendingCommands={pendingCommands}
            onCommandsFlushed={onCommandsFlushed}
            onComponentSelected={onComponentSelected}
            onStepChanged={onStepChanged}
            onArtifactError={onArtifactError}
          />

          <aside className="inspector-panel">
            <section className="dashboard-panel">
              <div className="panel-heading compact">
                <p className="eyebrow">
                  <Crosshair size={14} /> Selected Component
                </p>
              </div>
              {selectedComponent ? (
                <div className="inspector-body">
                  <h2>{selectedComponent.label}</h2>
                  <p className="muted tight">{selectedComponent.id}</p>
                  {selectedMetadata.length ? (
                    <dl className="metadata-list">
                      {selectedMetadata.slice(0, 6).map(([key, value]) => (
                        <div key={key}>
                          <dt>{key}</dt>
                          <dd>{String(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="muted tight">No metadata emitted for this component.</p>
                  )}
                </div>
              ) : (
                <p className="muted tight">Click a labeled part of the artifact to inspect it.</p>
              )}
            </section>

            <section className="dashboard-panel">
              <div className="panel-heading compact">
                <p className="eyebrow">
                  <ListChecks size={14} /> Walkthrough
                </p>
              </div>
              <ol className="walkthrough-rail">
                {artifact.walkthroughSteps.map((step, index) => (
                  <li key={step.id}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <strong>{step.title}</strong>
                      <p>{step.narration}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </aside>
        </div>
      </section>

      <aside className="room-chat">
        <header>
          <div>
            <p className="eyebrow">
              <MessageSquare size={14} /> Tutor channel
            </p>
            <h2>{selectedComponent ? selectedComponent.label : artifact.topic}</h2>
          </div>
          <button className="icon-button" onClick={onExit} aria-label="Exit experience">
            <LogOut size={18} />
          </button>
        </header>
        <ChatThread messages={roomMessages} artifacts={artifacts} trace={trace} onEnterExperience={onEnterExperience} showArtifactCards={false} />
        <ChatComposer disabled={busy} placeholder="Ask about this room" onSubmit={onTutorMessage} />
        <section className="command-log">
          <p className="eyebrow">
            <Braces size={14} /> Command buffer
          </p>
          <div className="log-list">
            {pendingCommands.length ? (
              pendingCommands.map((command, index) => (
                <div className="log-row" key={`${command.type}-${index}`}>
                  <RotateCcw size={14} />
                  <span>{command.type}</span>
                </div>
              ))
            ) : (
              <div className="log-row">
                <CheckCircle2 size={14} />
                <span>No pending commands</span>
              </div>
            )}
          </div>
        </section>
      </aside>
    </main>
  );
}
