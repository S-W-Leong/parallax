"use client";

import type { ArtifactRecord, ChatMessage } from "@/lib/artifacts/artifactTypes";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatThread } from "@/components/chat/ChatThread";

type ChatHomeProps = {
  messages: ChatMessage[];
  artifacts: Record<string, ArtifactRecord>;
  trace: string[];
  busy: boolean;
  onSendMessage: (message: string) => void;
  onStop: () => void;
  onEnterExperience: (artifactId: string) => void;
};

const STARTER_PROMPTS = ["Explain a fusion reactor", "Build a neuron synapse", "Show orbital resonance", "Model DNA replication"];

export function ChatHome({ messages, artifacts, trace, busy, onSendMessage, onStop, onEnterExperience }: ChatHomeProps) {
  const hasMessages = messages.length > 0;

  return (
    <section className="chat-home-shell" aria-label="Parallax chat">
      <div className="chat-scroll-region">
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
              <button className="prompt-chip" key={prompt} type="button" onClick={() => onSendMessage(prompt)} disabled={busy}>
                {prompt}
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
