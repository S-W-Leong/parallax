"use client";

import type { ArtifactRecord, ChatMessage } from "@/lib/artifacts/artifactTypes";
import { ExperienceProposalCard } from "./ExperienceProposalCard";
import { MarkdownMessage } from "./MarkdownMessage";

type ChatThreadProps = {
  messages: ChatMessage[];
  artifacts: Record<string, ArtifactRecord>;
  trace: string[];
  onEnterExperience: (artifactId: string) => void;
  showArtifactCards?: boolean;
  proposalMode?: "full" | "compact";
};

export function ChatThread({ messages, artifacts, trace, onEnterExperience, showArtifactCards = true, proposalMode = "full" }: ChatThreadProps) {
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
                <div className="message-content">
                  {message.role === "user" ? <p className="message-plain">{message.content}</p> : <MarkdownMessage content={message.content} />}
                  {message.status === "streaming" ? <span className="streaming-cursor" aria-hidden="true" /> : null}
                </div>
                {message.status === "stopped" ? <span className="message-status">Stopped</span> : null}
              </div>
              {artifact && showArtifactCards ? (
                <ExperienceProposalCard artifact={artifact} trace={trace} mode={proposalMode} onEnterExperience={onEnterExperience} />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
