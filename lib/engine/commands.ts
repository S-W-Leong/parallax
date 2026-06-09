import type { AnimationId, ComponentId } from "./lessonTypes";

export type RendererState = {
  selectedComponentId: ComponentId | null;
  focusedComponents: ComponentId[];
  exploded: boolean;
  currentAnimation: AnimationId | null;
  currentStepId: string | null;
  activityLog: string[];
  cameraPreset: string;
};

export type RendererCommand =
  | { type: "selectComponent"; componentId: ComponentId; source?: "mouse" | "touch" | "hand" | "agent" }
  | { type: "focusComponents"; componentIds: ComponentId[] }
  | { type: "setExploded"; exploded: boolean }
  | { type: "playAnimation"; animation: AnimationId; stepId?: string }
  | { type: "appendLog"; message: string }
  | {
      type: "startReteach";
      focusComponents?: ComponentId[];
      animation?: AnimationId;
      narration?: string;
    }
  | { type: "setCameraPreset"; cameraPreset: string }
  | { type: "resetView" };

export const initialRendererState: RendererState = {
  selectedComponentId: null,
  focusedComponents: [],
  exploded: true,
  currentAnimation: "airflow_intake",
  currentStepId: "intake",
  activityLog: ["Loading cached lesson"],
  cameraPreset: "wide_cutaway",
};

function appendLog(state: RendererState, message: string): RendererState {
  return {
    ...state,
    activityLog: [...state.activityLog.slice(-24), message],
  };
}

export function rendererReducer(state: RendererState, command: RendererCommand): RendererState {
  switch (command.type) {
    case "selectComponent":
      return appendLog(
        {
          ...state,
          selectedComponentId: command.componentId,
          focusedComponents: [command.componentId],
        },
        `Selected ${command.componentId}${command.source ? ` via ${command.source}` : ""}`,
      );
    case "focusComponents":
      return {
        ...state,
        focusedComponents: command.componentIds,
      };
    case "setExploded":
      return appendLog({ ...state, exploded: command.exploded }, command.exploded ? "Exploded cutaway enabled" : "Cutaway collapsed");
    case "playAnimation":
      return {
        ...state,
        currentAnimation: command.animation,
        currentStepId: command.stepId ?? state.currentStepId,
      };
    case "appendLog":
      return appendLog(state, command.message);
    case "startReteach":
      return appendLog(
        {
          ...state,
          focusedComponents: command.focusComponents ?? ["compressor", "shaft", "turbine"],
          selectedComponentId: "shaft",
          currentAnimation: command.animation ?? "turbine_shaft_compressor_replay",
          currentStepId: "reteach",
          cameraPreset: "turbine_shaft_focus",
        },
        command.narration ?? "Re-teach replay: turbine turns shaft, shaft drives compressor",
      );
    case "setCameraPreset":
      return {
        ...state,
        cameraPreset: command.cameraPreset,
      };
    case "resetView":
      return appendLog(
        {
          ...initialRendererState,
          activityLog: state.activityLog,
        },
        "View reset",
      );
    default:
      return state;
  }
}

export function isRendererCommand(value: unknown): value is RendererCommand {
  if (!value || typeof value !== "object" || !("type" in value)) {
    return false;
  }
  const command = value as { type: string };
  return [
    "selectComponent",
    "focusComponents",
    "setExploded",
    "playAnimation",
    "appendLog",
    "startReteach",
    "setCameraPreset",
    "resetView",
  ].includes(command.type);
}
