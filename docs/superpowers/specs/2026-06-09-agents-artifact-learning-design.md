# Parallax Agents Artifact Learning Design

**Date:** 2026-06-09
**Status:** Approved direction
**Branch:** `codex/agents-artifact-rebuild`

## Product Direction

Parallax is being rebuilt as a chat-first learning product that generates Claude-style interactive 3D learning artifacts for STEM topics.

The user starts in a centered chat interface. When the user asks to learn a topic, the agent plans a learning experience and generates a self-contained Three.js artifact. The user sees a proposal card with a lesson outline and an `Enter Experience` button. Entering opens a learning room with the generated 3D canvas on the left and the continuing chat thread on the right.

The new product bet is:

> A smart agent should be able to author a complete interactive 3D learning room from a normal chat request.

This replaces the old deterministic jet-engine-specific architecture. The old implementation should not remain visible in the rebuilt UX.

## Goals

- Support any STEM topic as a best-effort generated 3D experience.
- Use the OpenAI Agents SDK as the center of the server-side harness.
- Generate self-contained HTML artifacts through a fixed artifact template plus agent-generated Three.js scene JavaScript.
- Let users enter and exit a dedicated learning room.
- Put the canvas/stage on the left with more space than the chat panel.
- Keep the chat thread continuous between the chat-first view and learning room.
- Support walkthroughs, clickable components, rotate/pan/zoom, explode/collapse, labels, and reset camera controls.
- Make clicked components visible in chat as context events.
- Let the Tutor agent answer based on the selected component and active walkthrough step.
- Let the Tutor agent send commands back to the artifact through the same message channel.
- Persist chat and artifacts in browser localStorage for v1.
- Allow users to inspect and download generated HTML.

## Non-Goals For V1

- No live voice mode. Voice remains a stretch feature.
- No artifact regeneration or iterative editing loop as a required feature.
- No account system or server database.
- No provider abstraction. V1 uses OpenAI only through `OPENAI_API_KEY`.
- No arbitrary external image or texture loading inside generated artifacts.
- No old deterministic jet-engine fallback in the user-visible product.
- No mandatory Exa research. Research is optional and must fail gracefully.
- No browser smoke test before showing the proposal. V1 uses static validation only.

## Core UX Flow

### 1. Chat-First Home

The initial screen is a futuristic learning-lab chat interface:

- Centered chat thread.
- Composer at the bottom.
- No 3D stage until an artifact exists.
- Suggested prompts can exist later, but they are not required for v1.

Example user prompt:

```text
I wanna learn about jet engines.
```

### 2. Agent Builds An Experience

The Orchestrator agent reads the user request and decides whether it should create a 3D learning experience.

While building, the user sees a readable trace, not developer logs:

```text
Planning learning experience
Researching key mechanism if needed
Designing walkthrough
Generating interactive 3D artifact
Validating artifact contract
```

The trace should feel like a live build process, but it should not expose raw prompts, stack traces, or full tool payloads unless validation fails.

### 3. Proposal Card

After successful static validation, the assistant returns a proposal card:

- Title.
- Short summary.
- Four to six walkthrough steps.
- List of interactive components.
- `Enter Experience` button.

The card appears in the same chat thread. `Enter Experience` appears only after validation passes.

If validation fails, the raw validation/build error is shown instead of an enter button.

### 4. Learning Room

Entering the experience opens a split layout:

- Left: generated artifact iframe, taking the main stage.
- Right: chat panel with the same thread continuing.
- Top or edge chrome: exit, inspect code, download HTML, artifact title.

The artifact iframe owns its own standard controls:

- Start/pause walkthrough.
- Previous step.
- Next step.
- Explode/collapse.
- Reset camera.
- Labels toggle.

The user can also rotate, pan, and zoom the scene directly.

### 5. Component Clicks

When a user clicks a generated component, the artifact sends a strict event to the parent app. The parent app records this as a visible chat event:

```text
Selected: Compressor
```

The next user message and Tutor response receive that selected component as context.

Clicking a component does not automatically make the agent speak in v1.

### 6. Tutor Chat

The learning-room chat uses a separate Tutor agent, not the Orchestrator. The Tutor agent receives:

- Chat history.
- Active artifact metadata.
- Selected component.
- Current walkthrough step.
- Recent artifact events.

The Tutor can:

- Answer the user.
- Send artifact commands such as focus component, go to step, reset camera, start walkthrough, explode, collapse, or toggle labels.

The Tutor cannot regenerate or rewrite the artifact in v1.

### 7. Exit Experience

When the user exits:

- The app returns to the centered chat-first UI.
- A collapsed artifact preview remains available.
- The same chat thread remains visible.

## System Architecture

```text
Next.js app
  Chat-first UI
  Learning room UI
  Artifact iframe host
  localStorage session store

Next.js API routes
  Agents SDK harness
  Orchestrator agent endpoint
  Tutor agent endpoint

Agent harness
  Orchestrator agent
  Optional Exa research tool
  create_experience tool
  Tutor agent

Artifact system
  Fixed HTML template
  Generated scene JavaScript
  Helper runtime
  Static validator
  postMessage bridge
```

## Agents SDK Harness

V1 uses the OpenAI Agents SDK for TypeScript through `@openai/agents`. The SDK is a fit because the product needs tool calls, specialist agents, streaming events for readable traces, typed tool parameters, Zod validation, and later voice/realtime expansion.

Official references:

- [OpenAI Agents SDK TypeScript](https://openai.github.io/openai-agents-js/)
- [Agents guide](https://openai.github.io/openai-agents-js/guides/agents/)
- [Tools guide](https://openai.github.io/openai-agents-js/guides/tools/)
- [Streaming guide](https://openai.github.io/openai-agents-js/guides/streaming/)

### Provider Setup

V1 assumes:

```bash
OPENAI_API_KEY=
```

No Vercel AI SDK, Vercel AI Gateway, OpenRouter, or provider abstraction is required in v1.

### Orchestrator Agent

The Orchestrator agent handles chat-first requests and creation of learning experiences.

Responsibilities:

- Understand whether the user wants a 3D learning experience.
- Optionally research with Exa if the topic is niche, current, or accuracy-sensitive.
- Plan the learning objective and artifact structure.
- Call `create_experience` exactly when it has enough information to build.
- Return a concise assistant message plus proposal metadata after the tool succeeds.

The Orchestrator should not directly return generated code in plain text. Artifact creation goes through the tool.

### Optional Exa Research Tool

Exa is useful for:

- Niche STEM topics.
- Current scientific or technical topics.
- Grounding the lesson outline.
- Producing a lightweight sources section later.
- Strengthening the visible agentic story.

Exa is not mandatory for common STEM topics. If Exa fails, the agent continues from model knowledge and logs a readable fallback trace.

### `create_experience` Tool

The `create_experience` tool is the product API for generated artifacts.

The tool receives structured arguments:

```ts
type CreateExperienceInput = {
  title: string;
  summary: string;
  topic: string;
  walkthroughSteps: Array<{
    id: string;
    title: string;
    caption: string;
  }>;
  components: Array<{
    id: string;
    label: string;
    description: string;
  }>;
  sceneJavaScript: string;
};
```

The tool:

- Injects `sceneJavaScript` into the fixed artifact template.
- Runs static validation.
- Stores the artifact in the local session payload returned to the browser.
- Returns proposal metadata and either a valid artifact or raw validation errors.

The tool must reject outputs that:

- Include full HTML documents in `sceneJavaScript`.
- Try to load arbitrary remote assets.
- Use forbidden browser APIs.
- Do not register components.
- Do not define walkthrough steps.
- Do not use the required helper/runtime contract.

### Tutor Agent

The Tutor agent runs inside the learning room.

Responsibilities:

- Answer questions about the artifact.
- Use selected component and current walkthrough step as context.
- Explain the clicked component in relation to the learner's question.
- Issue artifact commands through the parent app when useful.

The Tutor agent may call a `send_artifact_command` tool:

```ts
type ArtifactCommand =
  | { type: "focus_component"; componentId: string }
  | { type: "go_to_step"; stepId: string }
  | { type: "start_walkthrough" }
  | { type: "pause_walkthrough" }
  | { type: "explode" }
  | { type: "collapse" }
  | { type: "reset_camera" }
  | { type: "toggle_labels"; visible: boolean };
```

The parent app forwards these commands to the iframe through `postMessage`.

## Artifact Runtime

### Runtime Strategy

V1 uses:

- Fixed HTML template.
- Local Three.js preferred.
- Limited CDN fallback.
- Agent-generated scene JavaScript only.
- Sandboxed iframe rendering.
- Helper runtime plus direct `THREE` access.

The artifact must be self-contained enough to inspect and download as an HTML file.

### Artifact Template

The parent app owns the artifact template. The agent only supplies the scene JavaScript body.

The fixed template provides:

- HTML shell.
- Canvas root.
- Standard control bar.
- Caption area.
- Local Three.js loader.
- CDN fallback loader.
- Helper runtime.
- `postMessage` event bridge.
- Basic styles.

### Helper Runtime Contract

The generated scene JavaScript can use direct `THREE` APIs plus these helpers:

```ts
registerComponent(id, label, object3D, metadata?)
emitComponentSelected(id, label, metadata?)
setWalkthroughSteps(steps)
setStatus(text)
fitCameraTo(objectOrVector)
```

Standard globals exposed by the template:

```ts
scene
camera
renderer
root
controls
THREE
```

The generated code is responsible for:

- Creating the visible 3D scene.
- Registering clickable components.
- Defining walkthrough steps and captions.
- Implementing component focus behavior.
- Responding to artifact commands.
- Supporting standard controls.

### Required Artifact Features

Every generated learning artifact must include:

- At least four walkthrough steps.
- At least three clickable components.
- A visible 3D scene.
- Captions owned by the artifact.
- Component selection events.
- Basic camera controls.
- Explode/collapse behavior when the concept supports it.
- Reset camera behavior.
- Labels toggle behavior.

For non-mechanical STEM topics, "components" can mean conceptual visual units:

- Cell parts.
- Molecules.
- Circuit elements.
- Orbital bodies.
- Algorithm states.
- Fields, vectors, waves, or forces.

### Artifact Event Contract

The iframe sends events to the parent app with `window.parent.postMessage`.

Required event shape:

```ts
type ArtifactEvent =
  | {
      type: "component_selected";
      artifactId: string;
      componentId: string;
      label: string;
      metadata?: Record<string, unknown>;
    }
  | {
      type: "walkthrough_step_changed";
      artifactId: string;
      stepId: string;
      title: string;
    }
  | {
      type: "artifact_ready";
      artifactId: string;
    }
  | {
      type: "artifact_error";
      artifactId: string;
      message: string;
    };
```

The parent app records component selections and step changes as context. Component selections appear as visible chat events.

### Artifact Command Contract

The parent app sends commands to the iframe with `iframe.contentWindow.postMessage`.

Required command shape:

```ts
type ParentArtifactMessage = {
  type: "artifact_command";
  artifactId: string;
  command: ArtifactCommand;
};
```

The generated artifact must listen for these commands and handle unsupported commands gracefully.

## Static Validation

V1 uses static validation only. Validation must run before showing `Enter Experience`.

Validation checks:

- `sceneJavaScript` is present and within size limits.
- No `<script>`, `</script>`, `<html>`, `<body>`, or full-document output in scene JS.
- No `eval`, `Function`, `document.write`, `localStorage`, `sessionStorage`, cookies, service workers, or navigation APIs.
- No arbitrary remote image or texture URLs.
- No network fetches except the fixed Three.js loader controlled by the template.
- Required helper calls are present:
  - `registerComponent`
  - `setWalkthroughSteps`
- Walkthrough steps count is at least four.
- Components count is at least three.
- Component IDs are stable strings.
- The output can be injected into the template without breaking the closing script tag.

If validation fails:

- Show raw validation/build error in chat.
- Do not show `Enter Experience`.
- Do not silently retry in v1.

## Sandboxing And Security

The generated artifact runs in an iframe using `srcdoc`.

Recommended sandbox posture:

```html
<iframe sandbox="allow-scripts">
```

Do not grant same-origin, forms, popups, downloads, top navigation, pointer lock, or storage access in v1.

The parent app should treat artifact messages as untrusted:

- Validate event shape.
- Ignore unknown event types.
- Ignore events for unknown artifact IDs.
- Never execute code received from the iframe.

Generated artifacts may use procedural geometry, generated canvas textures, or data URLs created inside the artifact. They may not load arbitrary external images or textures in v1.

## Persistence

V1 uses browser localStorage.

Persist:

- Chat messages.
- Artifact records.
- Active artifact ID.
- Collapsed artifact preview state.
- Selected component context.
- Current room mode.

No server database or authentication is required.

### Suggested Data Model

```ts
type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system_event";
  content: string;
  createdAt: string;
  artifactId?: string;
};

type ArtifactRecord = {
  id: string;
  title: string;
  topic: string;
  summary: string;
  walkthroughSteps: Array<{
    id: string;
    title: string;
    caption: string;
  }>;
  components: Array<{
    id: string;
    label: string;
    description: string;
  }>;
  sceneJavaScript: string;
  html: string;
  createdAt: string;
  validationStatus: "valid";
};

type LearningSessionState = {
  mode: "chat" | "learning_room";
  activeArtifactId: string | null;
  selectedComponent: {
    id: string;
    label: string;
    metadata?: Record<string, unknown>;
  } | null;
  activeStepId: string | null;
};
```

## Visual Direction

The shell should feel like a futuristic learning lab:

- Dark, immersive, simulation-room aesthetic.
- Strong canvas presence.
- Clean panel chrome.
- Avoid generic SaaS dashboard styling.
- Avoid marketing hero page composition.
- Keep controls functional and readable.

The learning room should prioritize the artifact:

```text
-------------------------------------------------
| 3D canvas / artifact stage        | chat panel |
|                                   |            |
|                                   |            |
|                                   | composer   |
-------------------------------------------------
```

The chat-first view should still feel calm and usable:

```text
-------------------------------
| centered conversation        |
|                              |
| proposal card when generated |
|                              |
| composer                     |
-------------------------------
```

## Codebase Rebuild Direction

The current deterministic jet-engine system should be removed from the rebuilt UX.

Remove or replace user-visible old architecture:

- `ParallaxDemo`
- deterministic jet-engine scene as the main page
- old `api/compile`, `api/ask`, `api/quiz` behavior
- old lesson JSON contract as the primary product contract
- old docs that present the deterministic template as the active direction

Keep only what helps the new architecture:

- General Three.js/R3F learnings.
- Existing package setup if useful.
- Exa wrapper ideas.
- S3 ideas as later persistence, not v1 scope.
- The downloaded Claude artifact as a quality benchmark, not production code.

## API Route Shape

Suggested v1 routes:

```text
POST /api/agent/chat
POST /api/agent/tutor
```

`/api/agent/chat`:

- Receives user message and client-side session payload.
- Runs the Orchestrator agent.
- May call optional research.
- Must call `create_experience` when generating an artifact.
- Returns updated assistant messages, readable trace, and artifact payload if created.

`/api/agent/tutor`:

- Receives user message, active artifact metadata, selected component, and active step.
- Runs the Tutor agent.
- Returns assistant answer plus optional artifact commands.

## Testing And Verification

V1 tests should cover boundaries more than visuals:

- Artifact static validator accepts a valid scene JS sample.
- Artifact static validator rejects full HTML.
- Artifact static validator rejects forbidden APIs.
- Artifact template injects scene JS safely.
- Artifact message parser accepts known events and rejects malformed ones.
- Artifact command parser validates commands before posting to iframe.
- localStorage session reducer saves and restores chat/artifact state.
- API tool schema validates `create_experience` inputs.

Manual QA:

- Ask for a common STEM topic and receive a proposal.
- Enter learning room.
- Start walkthrough.
- Click a component and see a chat event.
- Ask about the selected component and get a context-aware Tutor answer.
- Tutor sends a focus or step command to the artifact.
- Exit learning room and see collapsed preview.
- Inspect code.
- Download HTML.

## Acceptance Criteria

The rebuild is successful when:

- A user can ask for any STEM learning topic from the chat-first UI.
- The agent creates a validated generated Three.js artifact through `create_experience`.
- The proposal card shows title, summary, walkthrough steps, components, and `Enter Experience`.
- The learning room opens with canvas left and chat right.
- The artifact has a working walkthrough and clickable components.
- Component clicks appear as visible chat events and update Tutor context.
- The Tutor can answer from selected component/current step context.
- The Tutor can send at least one command back to the artifact.
- The user can exit back to centered chat with a collapsed artifact preview.
- Chat and artifact survive refresh through localStorage.
- The user can inspect and download generated HTML.

## Stretch

- Live voice mode with OpenAI Realtime agents.
- Artifact regeneration and version history.
- Browser smoke tests for nonblank canvas and console errors.
- Exa citations panel.
- Server-side persistence.
- Shareable artifact URLs.
- Multi-agent handoffs with a dedicated Researcher, Visual Director, Builder, and Critic.
- More aggressive sandbox verification.

