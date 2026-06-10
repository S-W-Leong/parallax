import { describe, expect, it } from "vitest";
import { decodeAgentStreamEvents, encodeAgentStreamEvent } from "@/lib/agent/streamProtocol";

describe("agent stream protocol", () => {
  it("round trips status, delta, and done events", () => {
    const text = [
      encodeAgentStreamEvent({ type: "status", message: "Let me think this through..." }),
      encodeAgentStreamEvent({ type: "delta", delta: "Cells " }),
      encodeAgentStreamEvent({ type: "delta", delta: "store energy." }),
      encodeAgentStreamEvent({ type: "done", message: "Cells store energy.", trace: [], artifact: null, commands: [], error: null }),
    ].join("");

    expect(decodeAgentStreamEvents(text)).toEqual([
      { type: "status", message: "Let me think this through..." },
      { type: "delta", delta: "Cells " },
      { type: "delta", delta: "store energy." },
      { type: "done", message: "Cells store energy.", trace: [], artifact: null, commands: [], error: null },
    ]);
  });
});
