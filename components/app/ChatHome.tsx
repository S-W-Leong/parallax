"use client";

import type { ArtifactRecord, ChatMessage } from "@/lib/artifacts/artifactTypes";
import { STARTER_PROMPTS, type StarterPrompt } from "@/lib/demo/jetEngineDemo";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatThread } from "@/components/chat/ChatThread";

type ChatHomeProps = {
  messages: ChatMessage[];
  artifacts: Record<string, ArtifactRecord>;
  trace: string[];
  busy: boolean;
  onSendMessage: (message: string) => void;
  onStarterPrompt: (prompt: StarterPrompt) => void;
  onStop: () => void;
  onEnterExperience: (artifactId: string) => void;
};

export function ChatHome({ messages, artifacts, trace, busy, onSendMessage, onStarterPrompt, onStop, onEnterExperience }: ChatHomeProps) {
  const hasMessages = messages.length > 0;

  return (
    <section className="chat-home-shell" aria-label="Parallax chat">
      <div className="chat-scroll-region">
        {!hasMessages ? (
          <div className="ambient-field" aria-hidden="true">
            <span className="ambient-ring ambient-ring-a" />
            <span className="ambient-ring ambient-ring-b" />
            <span className="ambient-connector ambient-connector-a" />
            <span className="ambient-connector ambient-connector-b" />
            <span className="ambient-node ambient-node-a" />
            <span className="ambient-node ambient-node-b" />
            <span className="ambient-node ambient-node-c" />
            <span className="ambient-node ambient-node-d" />
            <span className="ambient-node ambient-node-e" />
            <span className="ambient-node ambient-node-f" />
          </div>
        ) : null}
        <ChatThread
          messages={messages}
          artifacts={artifacts}
          trace={trace}
          onEnterExperience={onEnterExperience}
          proposalMode="full"
        />
        {!hasMessages ? (
          <div className="starter-prompts" aria-label="Starter prompts">
            {STARTER_PROMPTS.map((prompt) => (
              <button className="prompt-chip" key={prompt.id} type="button" onClick={() => onStarterPrompt(prompt)} disabled={busy}>
                {prompt.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="chat-composer-region">
        <ChatComposer pending={busy} placeholder="Ask to learn any STEM topic" onStop={onStop} onSubmit={onSendMessage} />
      </div>
    </section>
  );
}
