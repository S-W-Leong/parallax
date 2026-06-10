import type { AgentTraceEntry, ArtifactCommand, ArtifactRecord } from "@/lib/artifacts/artifactTypes";
import type { AgentActivityEvent } from "./activity";

export type AgentStreamEvent =
  | { type: "status"; message: string }
  | { type: "activity"; activity: AgentActivityEvent }
  | { type: "trace"; entry: AgentTraceEntry }
  | { type: "delta"; delta: string }
  | { type: "done"; message: string; trace: string[]; artifact: ArtifactRecord | null; commands: ArtifactCommand[]; error: string | null }
  | { type: "error"; message: string };

export function encodeAgentStreamEvent(event: AgentStreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function decodeAgentStreamEvents(chunk: string): AgentStreamEvent[] {
  return chunk
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const dataLine = block.split("\n").find((line) => line.startsWith("data: "));
      if (!dataLine) throw new Error("Missing stream event data line.");
      return JSON.parse(dataLine.slice("data: ".length)) as AgentStreamEvent;
    });
}
