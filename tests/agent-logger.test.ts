import { describe, expect, it } from "vitest";
import { createAgentLogger } from "@/lib/agent/logger";

describe("agent logger", () => {
  it("writes structured log entries with inherited context", () => {
    const entries: unknown[] = [];
    const logger = createAgentLogger({
      base: { requestId: "request-1", threadId: "thread-1" },
      sink: (entry) => entries.push(entry),
    });

    logger.info("agent.run.started", { mode: "chat" });

    expect(entries).toEqual([
      expect.objectContaining({
        level: "info",
        event: "agent.run.started",
        requestId: "request-1",
        threadId: "thread-1",
        mode: "chat",
      }),
    ]);
  });

  it("redacts prompt-like and payload-like fields", () => {
    const entries: unknown[] = [];
    const logger = createAgentLogger({ sink: (entry) => entries.push(entry) });

    logger.info("agent.request.started", {
      userMessage: "teach me a secret topic",
      prompt: "Context with private user data",
      sceneSource: "registerComponent(...)",
      threadId: "thread-1",
    });

    expect(entries[0]).toMatchObject({
      userMessage: "[redacted]",
      prompt: "[redacted]",
      sceneSource: "[redacted]",
      threadId: "thread-1",
    });
  });
});
