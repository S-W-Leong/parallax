"use client";

import { LogOut } from "lucide-react";
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
            <p className="eyebrow">Tutor</p>
            <h1>{selectedComponent ? selectedComponent.label : artifact.topic}</h1>
          </div>
          <button className="icon-button" onClick={onExit} aria-label="Exit experience">
            <LogOut size={18} />
          </button>
        </header>
        <ChatThread messages={messages} artifacts={artifacts} trace={trace} onEnterExperience={onEnterExperience} />
        <ChatComposer disabled={busy} placeholder="Ask about this room" onSubmit={onTutorMessage} />
      </aside>
    </main>
  );
}
