import { describe, expect, it } from "vitest";
import { decodeAgentStreamEvents, encodeAgentStreamEvent } from "@/lib/agent/streamProtocol";

describe("agent stream protocol", () => {
  it("round trips status, delta, and done events", () => {
    const text = [
      encodeAgentStreamEvent({ type: "status", message: "Let me think this through..." }),
      encodeAgentStreamEvent({ type: "activity", activity: { type: "agent.started", agentName: "Parallax Guide" } }),
      encodeAgentStreamEvent({ type: "activity", activity: { type: "tool.started", toolName: "build_learning_artifact", inputSummary: "Building cells" } }),
      encodeAgentStreamEvent({ type: "trace", entry: { kind: "reasoning", label: "Reasoning through next step" } }),
      encodeAgentStreamEvent({ type: "trace", entry: { kind: "tool", label: "Calling create_experience", detail: "Executing tool" } }),
      encodeAgentStreamEvent({ type: "delta", delta: "Cells " }),
      encodeAgentStreamEvent({ type: "delta", delta: "store energy." }),
      encodeAgentStreamEvent({ type: "done", message: "Cells store energy.", trace: [], artifact: null, commands: [], error: null }),
    ].join("");

    expect(decodeAgentStreamEvents(text)).toEqual([
      { type: "status", message: "Let me think this through..." },
      { type: "activity", activity: { type: "agent.started", agentName: "Parallax Guide" } },
      { type: "activity", activity: { type: "tool.started", toolName: "build_learning_artifact", inputSummary: "Building cells" } },
      { type: "trace", entry: { kind: "reasoning", label: "Reasoning through next step" } },
      { type: "trace", entry: { kind: "tool", label: "Calling create_experience", detail: "Executing tool" } },
      { type: "delta", delta: "Cells " },
      { type: "delta", delta: "store energy." },
      { type: "done", message: "Cells store energy.", trace: [], artifact: null, commands: [], error: null },
    ]);
  });
});
