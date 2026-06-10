"use client";

import { LogOut, MessageSquare, RefreshCcw } from "lucide-react";
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
  onStop?: () => void;
  onStopResponse: () => void;
  onExit: () => void;
  onResetSession: () => void;
  onLearningRoomMessage: (message: string) => void;
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
  onStop,
  onStopResponse,
  onExit,
  onResetSession,
  onLearningRoomMessage,
  onCommandsFlushed,
  onComponentSelected,
  onStepChanged,
  onArtifactError,
  onEnterExperience,
}: LearningRoomProps) {
  const stopHandler = onStop ?? onStopResponse;

  return (
    <section className="learning-room-shell" aria-label={`${artifact.title} learning room`}>
      <section className="learning-canvas-area">
        <header className="learning-room-header">
          <div>
            <p className="eyebrow">Learning room</p>
            <h1>{artifact.title}</h1>
          </div>
          {selectedComponent ? (
            <span className="selected-chip" title={selectedComponent.id}>
              {selectedComponent.label}
            </span>
          ) : null}
        </header>
        <div className="learning-canvas-frame">
          <ArtifactFrame
            artifact={artifact}
            pendingCommands={pendingCommands}
            onCommandsFlushed={onCommandsFlushed}
            onComponentSelected={onComponentSelected}
            onStepChanged={onStepChanged}
            onArtifactError={onArtifactError}
          />
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
          <div className="toolbar-actions">
            <button className="icon-button" onClick={onResetSession} aria-label="Start new chat" title="Start new chat">
              <RefreshCcw size={18} />
            </button>
            <button className="icon-button" onClick={onExit} aria-label="Exit experience" title="Exit experience">
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <ChatThread
          messages={messages}
          artifacts={artifacts}
          trace={trace}
          onEnterExperience={onEnterExperience}
          showArtifactCards={false}
          proposalMode="compact"
        />
        <ChatComposer disabled={false} pending={busy} placeholder="Ask about this room" onStop={stopHandler} onSubmit={onLearningRoomMessage} />
      </aside>
    </section>
  );
}
