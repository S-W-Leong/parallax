"use client";

import type { AgentTraceEntry, ArtifactRecord, ChatMessage } from "@/lib/artifacts/artifactTypes";
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

function AgentTraceList({ entries }: { entries: AgentTraceEntry[] }) {
  if (!entries.length) return null;

  return (
    <ol className="agent-trace-list" aria-label="Agent progress">
      {entries.map((entry, index) => (
        <li className={`agent-trace-entry agent-trace-${entry.kind}`} key={`${entry.kind}-${entry.label}-${index}`}>
          <span>{entry.label}</span>
          {entry.detail ? <small>{entry.detail}</small> : null}
        </li>
      ))}
    </ol>
  );
}

export function ChatThread({ messages, artifacts, trace, onEnterExperience, showArtifactCards = true, proposalMode = "full" }: ChatThreadProps) {
  if (!messages.length) {
    return (
      <div className="empty-thread">
        <p className="eyebrow">Parallax</p>
        <h1>What should we explore?</h1>
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
                {message.agentTrace?.length ? <AgentTraceList entries={message.agentTrace} /> : null}
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
