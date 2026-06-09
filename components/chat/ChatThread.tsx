"use client";

import type { ArtifactRecord, ChatMessage } from "@/lib/artifacts/artifactTypes";
import { ExperienceProposalCard } from "./ExperienceProposalCard";

type ChatThreadProps = {
  messages: ChatMessage[];
  artifacts: Record<string, ArtifactRecord>;
  trace: string[];
  onEnterExperience: (artifactId: string) => void;
};

export function ChatThread({ messages, artifacts, trace, onEnterExperience }: ChatThreadProps) {
  if (!messages.length) {
    return (
      <div className="empty-thread">
        <p className="eyebrow">Parallax</p>
        <h1>What should we build into 3D?</h1>
      </div>
    );
  }

  return (
    <div className="thread">
      {messages.map((message) => {
        const artifact = message.artifactId ? artifacts[message.artifactId] : null;
        return (
          <div className={`message-row message-${message.role}`} key={message.id}>
            <div className="message-stack">
              <div className="message-bubble">
                <p>{message.content}</p>
              </div>
              {artifact ? <ExperienceProposalCard artifact={artifact} trace={trace} onEnterExperience={onEnterExperience} /> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
