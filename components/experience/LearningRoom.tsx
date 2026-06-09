"use client";

import { LogOut, RefreshCcw } from "lucide-react";
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
  onExit,
  onResetSession,
  onLearningRoomMessage,
  onCommandsFlushed,
  onComponentSelected,
  onStepChanged,
  onArtifactError,
  onEnterExperience,
}: LearningRoomProps) {
  return (
    <main className="learning-room">
      <ArtifactFrame
        artifact={artifact}
        pendingCommands={pendingCommands}
        onCommandsFlushed={onCommandsFlushed}
        onComponentSelected={onComponentSelected}
        onStepChanged={onStepChanged}
        onArtifactError={onArtifactError}
      />
      <aside className="room-chat">
        <header>
          <div>
            <p className="eyebrow">Room guide</p>
            <h1>{selectedComponent ? selectedComponent.label : artifact.topic}</h1>
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
        <ChatThread messages={messages} artifacts={artifacts} trace={trace} onEnterExperience={onEnterExperience} />
        <ChatComposer disabled={busy} placeholder="Ask about this room" onSubmit={onLearningRoomMessage} />
      </aside>
    </main>
  );
}
