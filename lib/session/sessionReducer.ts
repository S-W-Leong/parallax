import type { ArtifactCommand, ArtifactRecord, ChatMessage, LearningSession, SelectedComponent } from "@/lib/artifacts/artifactTypes";

export type SessionAction =
  | { type: "session_loaded"; session: LearningSession }
  | { type: "user_message"; content: string }
  | { type: "assistant_message"; content: string; artifactId?: string }
  | { type: "assistant_draft_started"; id: string; content: string; artifactId?: string }
  | { type: "assistant_draft_replaced"; id: string; content: string }
  | { type: "assistant_draft_delta"; id: string; delta: string }
  | { type: "assistant_draft_completed"; id: string; content: string; artifactId?: string }
  | { type: "assistant_draft_stopped"; id: string }
  | { type: "system_event"; content: string; artifactId?: string }
  | { type: "artifact_created"; artifact: ArtifactRecord; trace: string[]; message?: string }
  | { type: "artifact_attached_to_message"; id: string; artifact: ArtifactRecord; trace: string[]; content: string }
  | { type: "enter_experience"; artifactId: string }
  | { type: "exit_experience" }
  | { type: "component_selected"; component: SelectedComponent }
  | { type: "step_changed"; stepId: string; title: string }
  | { type: "artifact_error"; message: string }
  | { type: "enqueue_commands"; commands: ArtifactCommand[] }
  | { type: "clear_pending_commands" }
  | { type: "reset_session" };

function makeId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

function now(): string {
  return new Date().toISOString();
}

function message(role: ChatMessage["role"], content: string, artifactId?: string): ChatMessage {
  const chatMessage: ChatMessage = {
    id: makeId("message"),
    role,
    content,
    createdAt: now(),
  };
  if (artifactId) chatMessage.artifactId = artifactId;
  return chatMessage;
}

function draftMessage(id: string, content: string, artifactId?: string): ChatMessage {
  const chatMessage: ChatMessage = {
    id,
    role: "assistant",
    content,
    createdAt: now(),
    status: "streaming",
  };
  if (artifactId) chatMessage.artifactId = artifactId;
  return chatMessage;
}

function updateMessage(state: LearningSession, id: string, update: (message: ChatMessage) => ChatMessage): LearningSession {
  return {
    ...state,
    messages: state.messages.map((existing) => (existing.id === id ? update(existing) : existing)),
  };
}

export function createEmptySession(): LearningSession {
  return {
    id: makeId("session"),
    mode: "chat",
    messages: [],
    artifacts: {},
    activeArtifactId: null,
    lastArtifactId: null,
    selectedComponent: null,
    activeStepId: null,
    pendingCommands: [],
    trace: [],
  };
}

export function sessionReducer(state: LearningSession, action: SessionAction): LearningSession {
  switch (action.type) {
    case "session_loaded":
      return action.session;
    case "reset_session":
      return createEmptySession();
    case "user_message":
      return { ...state, messages: [...state.messages, message("user", action.content, state.activeArtifactId ?? undefined)] };
    case "assistant_message":
      return { ...state, messages: [...state.messages, message("assistant", action.content, action.artifactId)] };
    case "assistant_draft_started":
      return { ...state, messages: [...state.messages, draftMessage(action.id, action.content, action.artifactId)] };
    case "assistant_draft_replaced":
      return updateMessage(state, action.id, (existing) => ({ ...existing, content: action.content, status: "streaming" }));
    case "assistant_draft_delta":
      return updateMessage(state, action.id, (existing) => ({ ...existing, content: `${existing.content}${action.delta}`, status: "streaming" }));
    case "assistant_draft_completed":
      return updateMessage(state, action.id, (existing) => ({
        ...existing,
        content: action.content,
        artifactId: action.artifactId ?? existing.artifactId,
        status: "complete",
      }));
    case "system_event":
      return { ...state, messages: [...state.messages, message("system", action.content, action.artifactId)] };
    case "artifact_created":
      return {
        ...state,
        artifacts: { ...state.artifacts, [action.artifact.id]: action.artifact },
        lastArtifactId: action.artifact.id,
        trace: action.trace,
        messages: [
          ...state.messages,
          message(
            "assistant",
            action.message ?? `I built ${action.artifact.title}. Review the proposal, then enter the experience.`,
            action.artifact.id,
          ),
        ],
      };
    case "assistant_draft_stopped":
      return updateMessage(state, action.id, (existing) => ({ ...existing, status: "stopped" }));
    case "artifact_attached_to_message":
      return {
        ...state,
        artifacts: { ...state.artifacts, [action.artifact.id]: action.artifact },
        lastArtifactId: action.artifact.id,
        trace: action.trace,
        messages: state.messages.map((existing) =>
          existing.id === action.id
            ? { ...existing, content: action.content, artifactId: action.artifact.id, status: "complete" }
            : existing,
        ),
      };
    case "enter_experience": {
      const artifact = state.artifacts[action.artifactId];
      if (!artifact) return state;
      return {
        ...state,
        mode: "learning_room",
        activeArtifactId: action.artifactId,
        lastArtifactId: action.artifactId,
        selectedComponent: null,
        activeStepId: artifact.walkthroughSteps[0]?.id ?? null,
      };
    }
    case "exit_experience":
      return {
        ...state,
        mode: "chat",
        lastArtifactId: state.activeArtifactId ?? state.lastArtifactId,
        activeArtifactId: null,
        selectedComponent: null,
        activeStepId: null,
        pendingCommands: [],
      };
    case "component_selected":
      return {
        ...state,
        selectedComponent: action.component,
      };
    case "step_changed":
      return {
        ...state,
        activeStepId: action.stepId,
      };
    case "artifact_error":
      return { ...state, messages: [...state.messages, message("system", `Artifact error: ${action.message}`, state.activeArtifactId ?? undefined)] };
    case "enqueue_commands":
      return { ...state, pendingCommands: [...state.pendingCommands, ...action.commands] };
    case "clear_pending_commands":
      return { ...state, pendingCommands: [] };
    default:
      return state;
  }
}
