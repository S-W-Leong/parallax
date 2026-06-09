# Parallax Architecture

Parallax is a chat-first STEM learning app. A single OpenAI Agents SDK agent handles normal conversation, creates sandboxed Three.js artifacts when useful, and controls the active learning room through tools.

## Product Flow

```mermaid
flowchart TD
  A[Centered chat] --> B[User message]
  B --> C[/api/agent mode: chat]
  C --> D[Parallax Agent]
  D -- normal chat --> E[Assistant reply]
  D -- artifact needed --> F[create_experience tool]
  F --> G[Static artifact validation]
  G -- valid --> H[Proposal card]
  G -- invalid --> I[Raw validation error in chat]
  H --> J[Enter Experience]
  J --> K[Learning room]
  K --> L[Sandboxed Three.js iframe]
  K --> M[Room chat]
  L --> N[Component selected event]
  L --> O[Walkthrough step event]
  N --> M
  O --> M
  M --> P[/api/agent mode: learning_room]
  P --> D
  D -- command useful --> Q[send_artifact_command tool]
  Q --> L
  K --> R[Exit]
  R --> A
```

## Runtime Boundaries

```mermaid
flowchart LR
  subgraph Browser
    Chat[Centered Chat UI]
    Room[Learning Room]
    Frame[Sandboxed Artifact Iframe]
    Store[LocalStorage Session]
  end

  subgraph NextRoutes[Next.js API Routes]
    AgentAPI[/api/agent]
  end

  subgraph Agents[OpenAI Agents SDK]
    Agent[Parallax Agent]
    CreateTool[create_experience]
    ResearchTool[research_stem_topic]
    CommandTool[send_artifact_command]
  end

  subgraph ArtifactRuntime[Fixed Artifact Runtime]
    Template[HTML Shell]
    Validator[Static Validator]
    Three[Local Three Module with CDN fallback]
    Bridge[postMessage Contract]
  end

  Chat --> AgentAPI
  Chat --> Store
  AgentAPI --> Agent
  Agent --> ResearchTool
  Agent --> CreateTool
  CreateTool --> Validator
  Validator --> Template
  Template --> Chat
  Chat --> Room
  Room --> Frame
  Frame --> Three
  Frame --> Bridge
  Bridge --> Room
  Room --> AgentAPI
  Agent --> CommandTool
  CommandTool --> Bridge
```

## Agent API Contract

The app has one agent endpoint: `POST /api/agent`.

Main chat sends:

```json
{
  "mode": "chat",
  "message": "Teach me jet engines",
  "messages": []
}
```

Learning room chat sends:

```json
{
  "mode": "learning_room",
  "message": "Focus the combustor",
  "artifact": {},
  "messages": [],
  "selectedComponent": null,
  "activeStepId": "intro"
}
```

The route gives the same Parallax Agent different tools based on mode. Main chat gets `research_stem_topic` and `create_experience`. Learning room chat gets `send_artifact_command` plus active artifact context.

## Artifact Contract

The model does not generate the whole page. It generates `sceneSource` JavaScript plus metadata. The fixed runtime provides:

- `THREE`, `scene`, `camera`, `renderer`, `root`, and `controls`
- `registerComponent(id, label, object3D, metadata)`
- `setWalkthroughSteps(steps)`
- `setStatus(message)`
- `fitCameraTo(object3D, position?)`

The validator rejects network calls, dynamic imports, markup injection, oversized code, scenes without at least three registered components, and scenes without walkthrough steps.

## Message Contract

Artifacts post events to the parent:

- `artifact_ready`
- `component_selected`
- `walkthrough_step_changed`
- `artifact_error`

The parent sends commands back:

- `focus_component`
- `go_to_step`
- `start_walkthrough`
- `pause_walkthrough`
- `reset_camera`
- `explode`
- `collapse`
- `toggle_labels`

## Key Decisions

- **Canvas-left learning room**: the artifact is the main stage; chat is contextual support.
- **Proposal first**: the user sees the generated plan before entering.
- **One-shot artifacts**: v1 creates the best complete experience in one pass instead of editing artifacts in place.
- **Sandboxed iframe**: generated code runs in an iframe with a strict `postMessage` bridge.
- **Fixed runtime, generated scene**: the app owns controls, labels, walkthrough UI, and validation.
- **Single Parallax Agent**: one Agents SDK agent handles chat, artifact creation, and room control with mode-specific tools.
- **Single agent endpoint**: `/api/agent` accepts a mode-discriminated payload instead of separate mode-specific routes.
- **Local persistence**: browser storage keeps the chat, generated artifacts, and room state available after refresh.
