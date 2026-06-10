import type { AgentTraceEntry } from "@/lib/artifacts/artifactTypes";

export type AgentActivityPhase =
  | "artifact.build"
  | "artifact.validate"
  | "artifact.critique"
  | "artifact.persist"
  | "research";

export type AgentActivityEvent =
  | { type: "agent.started"; agentName: string }
  | { type: "reasoning.started"; label?: string }
  | { type: "tool.started"; toolName: string; callId?: string; inputSummary?: string }
  | { type: "tool.completed"; toolName: string; callId?: string; outputSummary?: string; ok: boolean }
  | { type: "phase.started"; phase: AgentActivityPhase; label: string; detail?: string }
  | { type: "phase.completed"; phase: AgentActivityPhase; label: string; ok: boolean; detail?: string };

export type AgentActivityEmitter = (activity: AgentActivityEvent) => void;

export function activityToTraceEntry(activity: AgentActivityEvent): AgentTraceEntry {
  switch (activity.type) {
    case "agent.started":
      return { kind: "agent", label: `Using ${activity.agentName}` };
    case "reasoning.started":
      return { kind: "reasoning", label: activity.label ?? "Reasoning through next step" };
    case "tool.started":
      return {
        kind: "tool",
        label: `Calling ${activity.toolName}`,
        detail: activity.inputSummary ?? "Executing tool",
      };
    case "tool.completed":
      return {
        kind: "tool",
        label: `${activity.toolName} completed`,
        detail: activity.outputSummary,
      };
    case "phase.started":
      return { kind: "phase", label: activity.label, detail: activity.detail };
    case "phase.completed":
      return { kind: "phase", label: activity.label, detail: activity.detail };
  }
}
