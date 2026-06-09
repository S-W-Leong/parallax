# Agents Artifact Learning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Parallax into a chat-first STEM learning app that uses the OpenAI Agents SDK to generate sandboxed Three.js learning artifacts, then lets users enter a canvas-left learning room with contextual tutor chat.

**Architecture:** The app becomes a Next.js client shell with localStorage persistence, a fixed HTML artifact template, static artifact validation, and strict iframe `postMessage` contracts. Server-side Next.js API routes host an OpenAI Agents SDK Orchestrator and Tutor; the Orchestrator must call `create_experience`, while the Tutor can answer and emit artifact commands.

**Tech Stack:** Next.js, TypeScript, React, OpenAI Agents SDK (`@openai/agents`), Zod, Exa optional research, Three.js loaded by generated artifacts, Vitest.

---

## Source Notes

Use the current OpenAI Agents SDK TypeScript docs while implementing:

- Agents: `https://openai.github.io/openai-agents-js/guides/agents/`
- Tools: `https://openai.github.io/openai-agents-js/guides/tools/`
- Running agents: `https://openai.github.io/openai-agents-js/guides/running-agents/`
- Streaming: `https://openai.github.io/openai-agents-js/guides/streaming/`

The plan relies on these SDK APIs:

```ts
import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";
```

## Scope Check

This is a large rebuild, but it is one cohesive MVP: chat creates a learning artifact, the artifact opens in a learning room, and the tutor uses artifact context. The tasks are sequenced so each produces a testable layer before the next layer consumes it.

Do not keep the deterministic jet-engine app as a user-visible fallback.

## File Structure

Create or modify these files:

- `package.json` - replace obsolete AI/demo dependencies with `@openai/agents` while keeping Next, React, Exa, Three.js, Zod, Vitest, and icons.
- `README.md` - update run notes and environment variables for the Agents SDK rebuild.
- `app/page.tsx` - render the new `ParallaxArtifactApp`.
- `app/layout.tsx` - keep metadata, update description.
- `app/globals.css` - replace old two-panel demo styling with futuristic learning-lab layout.
- `app/api/agent/chat/route.ts` - Orchestrator agent route.
- `app/api/agent/tutor/route.ts` - Tutor agent route.
- `components/app/ParallaxArtifactApp.tsx` - top-level client state and mode switch.
- `components/chat/ChatComposer.tsx` - reusable composer.
- `components/chat/ChatThread.tsx` - chat and system-event rendering.
- `components/chat/ExperienceProposalCard.tsx` - proposal card with `Enter Experience`.
- `components/experience/ArtifactFrame.tsx` - sandboxed iframe host, event parser, command sender, inspect/download actions.
- `components/experience/CodeInspector.tsx` - generated HTML inspector dialog.
- `components/experience/LearningRoom.tsx` - canvas-left room with chat-right panel.
- `components/experience/CollapsedArtifactPreview.tsx` - collapsed preview after exit.
- `lib/agent/agents.ts` - Orchestrator/Tutor agent factories.
- `lib/agent/prompts.ts` - prompt text for Orchestrator and Tutor.
- `lib/agent/routes.ts` - pure request handlers used by API routes and tests.
- `lib/agent/tools/createExperienceTool.ts` - `create_experience` tool sink.
- `lib/agent/tools/sendArtifactCommandTool.ts` - Tutor command tool sink.
- `lib/agent/exa.ts` - keep or simplify existing Exa wrapper for optional research.
- `lib/artifacts/artifactTypes.ts` - artifact, proposal, event, command, and tool-input schemas.
- `lib/artifacts/artifactTemplate.ts` - fixed HTML shell and runtime.
- `lib/artifacts/artifactValidator.ts` - static validation.
- `lib/artifacts/messageBridge.ts` - parse iframe events and parent commands.
- `lib/session/sessionReducer.ts` - pure local session reducer.
- `lib/session/sessionStorage.ts` - localStorage encode/decode helpers.
- `lib/session/usePersistentSession.ts` - React hook wrapping localStorage and reducer.
- `tests/artifact-template.test.ts` - template injection and escaping.
- `tests/artifact-validator.test.ts` - static validation rules.
- `tests/message-bridge.test.ts` - event/command contract validation.
- `tests/session-reducer.test.ts` - chat/artifact state transitions.
- `tests/agent-tools.test.ts` - create/tutor tool behavior without live model calls.

Delete these old user-visible demo files after replacements exist:

- `components/demo/ParallaxDemo.tsx`
- `components/engine/Airflow.tsx`
- `components/engine/EnginePart.tsx`
- `components/engine/JetEngineModel.tsx`
- `components/engine/JetEngineScene.tsx`
- `components/engine/Labels.tsx`
- `components/panel/AgentPanel.tsx`
- `components/panel/QuizCard.tsx`
- `components/input/useHandTracking.ts`
- `components/input/useVoiceInput.ts`
- `lib/engine/commands.ts`
- `lib/engine/engineConfig.ts`
- `lib/engine/lessonTypes.ts`
- `app/api/ask/route.ts`
- `app/api/compile/route.ts`
- `app/api/lesson/route.ts`
- `app/api/quiz/route.ts`
- `data/cached-jet-engine-lesson.json`
- `tests/commands.test.ts`
- `tests/lesson-schema.test.ts`

Keep historical docs unless they cause confusion in README navigation. Do not delete the newly approved spec.

## Task 1: Replace Dependencies And App Entry

**Files:**
- Modify: `package.json`
- Modify: `app/layout.tsx`
- Modify: `app/page.tsx`
- Create: `components/app/ParallaxArtifactApp.tsx`
- Modify: `README.md`

- [ ] **Step 1: Update dependencies**

Replace the dependency block in `package.json` so the app no longer depends on Vercel AI SDK, React Three Fiber, MediaPipe, or AWS for v1.

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@openai/agents": "latest",
    "exa-js": "latest",
    "lucide-react": "latest",
    "next": "latest",
    "react": "latest",
    "react-dom": "latest",
    "three": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "@types/node": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "typescript": "latest",
    "vitest": "latest"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` updates and `npm ls @openai/agents` shows one installed version.

- [ ] **Step 3: Point the page at the new app shell**

Create the local Three.js asset used by the artifact iframe before any generated artifact runs:

```bash
mkdir -p public/three
cp node_modules/three/build/three.min.js public/three/three.min.js
```

Expected: `public/three/three.min.js` exists and can be served by Next.js. Commit this vendor asset because the artifact runtime must work without relying on CDN availability.

- [ ] **Step 4: Point the page at the new app shell**

Replace `app/page.tsx` with:

```tsx
import { ParallaxArtifactApp } from "@/components/app/ParallaxArtifactApp";

export default function Home() {
  return <ParallaxArtifactApp />;
}
```

- [ ] **Step 5: Update app metadata**

Replace `app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Parallax",
  description: "Agent-generated interactive 3D learning rooms for STEM topics",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 6: Create a temporary app shell**

Create `components/app/ParallaxArtifactApp.tsx`:

```tsx
"use client";

export function ParallaxArtifactApp() {
  return (
    <main className="lab-shell">
      <section className="chat-home">
        <div className="lab-mark">Parallax</div>
        <h1>Ask for any STEM topic. I will build a 3D learning room.</h1>
        <p className="muted">The Agents SDK harness and artifact runtime are wired in the next tasks.</p>
      </section>
    </main>
  );
}
```

- [ ] **Step 7: Replace README environment notes**

Update `README.md` so it describes the new direction and environment:

```md
# Parallax

Parallax is a Next.js app for agent-generated interactive 3D learning rooms. A user starts in chat, asks to learn a STEM topic, and the OpenAI Agents SDK harness generates a sandboxed Three.js artifact with a walkthrough and clickable components.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4
EXA_API_KEY=
```

`OPENAI_API_KEY` is required for live artifact creation and tutor chat. `OPENAI_MODEL` is optional and defaults to `gpt-5.4`. `EXA_API_KEY` is optional; when absent or failing, the Orchestrator continues from model knowledge.

## Verification

```bash
npm run test
npm run build
```
```

- [ ] **Step 8: Run build to confirm the new shell compiles**

Run:

```bash
npm run build
```

Expected: build succeeds after old user-visible demo files are removed in Task 8. During this first shell step, record any compile failure that is caused by old demo imports and proceed to Task 8 cleanup before final verification.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json public/three/three.min.js app/page.tsx app/layout.tsx components/app/ParallaxArtifactApp.tsx README.md
git commit -m "Start Agents artifact app shell"
```

## Task 2: Define Artifact And Session Contracts

**Files:**
- Create: `lib/artifacts/artifactTypes.ts`
- Create: `lib/session/sessionReducer.ts`
- Test: `tests/session-reducer.test.ts`

- [ ] **Step 1: Write failing session reducer tests**

Create `tests/session-reducer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createEmptySession, sessionReducer } from "@/lib/session/sessionReducer";
import type { ArtifactRecord } from "@/lib/artifacts/artifactTypes";

const artifact: ArtifactRecord = {
  id: "artifact_1",
  title: "Orbital Mechanics",
  topic: "orbits",
  summary: "A walkthrough of gravity, velocity, and stable orbit paths.",
  walkthroughSteps: [
    { id: "gravity", title: "Gravity", caption: "Gravity pulls the satellite inward." },
    { id: "velocity", title: "Velocity", caption: "Tangential velocity keeps it moving sideways." },
    { id: "balance", title: "Balance", caption: "Orbit happens when falling keeps missing Earth." },
    { id: "energy", title: "Energy", caption: "Energy determines the orbit shape." },
  ],
  components: [
    { id: "earth", label: "Earth", description: "The central gravitating body." },
    { id: "satellite", label: "Satellite", description: "The orbiting body." },
    { id: "velocityVector", label: "Velocity vector", description: "Sideways motion." },
  ],
  sceneJavaScript: "registerComponent('earth', 'Earth', root); setWalkthroughSteps([]);",
  html: "<html><body>artifact</body></html>",
  createdAt: "2026-06-09T00:00:00.000Z",
  validationStatus: "valid",
};

describe("sessionReducer", () => {
  it("starts in centered chat mode", () => {
    expect(createEmptySession()).toMatchObject({
      mode: "chat",
      activeArtifactId: null,
      selectedComponent: null,
      activeStepId: null,
      messages: [],
      artifacts: {},
    });
  });

  it("adds messages and artifact proposal records", () => {
    const state = createEmptySession();
    const next = sessionReducer(state, { type: "artifact_created", artifact });

    expect(next.artifacts.artifact_1).toEqual(artifact);
    expect(next.messages.at(-1)).toMatchObject({
      role: "assistant",
      artifactId: "artifact_1",
    });
  });

  it("enters and exits the learning room", () => {
    const withArtifact = sessionReducer(createEmptySession(), { type: "artifact_created", artifact });
    const inRoom = sessionReducer(withArtifact, { type: "enter_experience", artifactId: "artifact_1" });
    const backHome = sessionReducer(inRoom, { type: "exit_experience" });

    expect(inRoom.mode).toBe("learning_room");
    expect(inRoom.activeArtifactId).toBe("artifact_1");
    expect(backHome.mode).toBe("chat");
    expect(backHome.collapsedArtifactId).toBe("artifact_1");
  });

  it("records component selections as visible system events", () => {
    const withArtifact = sessionReducer(createEmptySession(), { type: "artifact_created", artifact });
    const selected = sessionReducer(withArtifact, {
      type: "component_selected",
      artifactId: "artifact_1",
      component: { id: "satellite", label: "Satellite" },
    });

    expect(selected.selectedComponent).toEqual({ id: "satellite", label: "Satellite" });
    expect(selected.messages.at(-1)).toMatchObject({
      role: "system_event",
      content: "Selected: Satellite",
      artifactId: "artifact_1",
    });
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
npm run test -- tests/session-reducer.test.ts
```

Expected: fail because `lib/session/sessionReducer.ts` and artifact types do not exist.

- [ ] **Step 3: Create artifact schemas and types**

Create `lib/artifacts/artifactTypes.ts`:

```ts
import { z } from "zod";

export const walkthroughStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  caption: z.string().min(1),
});

export const artifactComponentSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
});

export const createExperienceInputSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  topic: z.string().min(1),
  walkthroughSteps: z.array(walkthroughStepSchema).min(4).max(8),
  components: z.array(artifactComponentSchema).min(3).max(24),
  sceneJavaScript: z.string().min(80).max(70000),
});

export const artifactRecordSchema = createExperienceInputSchema.extend({
  id: z.string().min(1),
  html: z.string().min(1),
  createdAt: z.string().datetime(),
  validationStatus: z.literal("valid"),
});

export const chatMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant", "system_event"]),
  content: z.string(),
  createdAt: z.string().datetime(),
  artifactId: z.string().optional(),
});

export const selectedComponentSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const learningSessionSchema = z.object({
  mode: z.enum(["chat", "learning_room"]),
  messages: z.array(chatMessageSchema),
  artifacts: z.record(z.string(), artifactRecordSchema),
  activeArtifactId: z.string().nullable(),
  collapsedArtifactId: z.string().nullable(),
  selectedComponent: selectedComponentSchema.nullable(),
  activeStepId: z.string().nullable(),
});

export type WalkthroughStep = z.infer<typeof walkthroughStepSchema>;
export type ArtifactComponent = z.infer<typeof artifactComponentSchema>;
export type CreateExperienceInput = z.infer<typeof createExperienceInputSchema>;
export type ArtifactRecord = z.infer<typeof artifactRecordSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type SelectedComponent = z.infer<typeof selectedComponentSchema>;
export type LearningSession = z.infer<typeof learningSessionSchema>;
```

- [ ] **Step 4: Create pure session reducer**

Create `lib/session/sessionReducer.ts`:

```ts
import type { ArtifactRecord, ChatMessage, LearningSession, SelectedComponent } from "@/lib/artifacts/artifactTypes";

export type SessionAction =
  | { type: "user_message"; content: string }
  | { type: "assistant_message"; content: string; artifactId?: string }
  | { type: "system_event"; content: string; artifactId?: string }
  | { type: "artifact_created"; artifact: ArtifactRecord }
  | { type: "enter_experience"; artifactId: string }
  | { type: "exit_experience" }
  | { type: "component_selected"; artifactId: string; component: SelectedComponent }
  | { type: "walkthrough_step_changed"; artifactId: string; stepId: string; title: string };

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function now() {
  return new Date().toISOString();
}

function message(role: ChatMessage["role"], content: string, artifactId?: string): ChatMessage {
  return {
    id: makeId(role),
    role,
    content,
    createdAt: now(),
    artifactId,
  };
}

export function createEmptySession(): LearningSession {
  return {
    mode: "chat",
    messages: [],
    artifacts: {},
    activeArtifactId: null,
    collapsedArtifactId: null,
    selectedComponent: null,
    activeStepId: null,
  };
}

export function sessionReducer(state: LearningSession, action: SessionAction): LearningSession {
  switch (action.type) {
    case "user_message":
      return { ...state, messages: [...state.messages, message("user", action.content)] };
    case "assistant_message":
      return { ...state, messages: [...state.messages, message("assistant", action.content, action.artifactId)] };
    case "system_event":
      return { ...state, messages: [...state.messages, message("system_event", action.content, action.artifactId)] };
    case "artifact_created":
      return {
        ...state,
        artifacts: { ...state.artifacts, [action.artifact.id]: action.artifact },
        collapsedArtifactId: action.artifact.id,
        messages: [
          ...state.messages,
          message(
            "assistant",
            `I built "${action.artifact.title}". Review the outline and enter the experience when you are ready.`,
            action.artifact.id,
          ),
        ],
      };
    case "enter_experience":
      return {
        ...state,
        mode: "learning_room",
        activeArtifactId: action.artifactId,
        collapsedArtifactId: null,
      };
    case "exit_experience":
      return {
        ...state,
        mode: "chat",
        collapsedArtifactId: state.activeArtifactId,
        activeArtifactId: null,
      };
    case "component_selected":
      return {
        ...state,
        selectedComponent: action.component,
        messages: [...state.messages, message("system_event", `Selected: ${action.component.label}`, action.artifactId)],
      };
    case "walkthrough_step_changed":
      return {
        ...state,
        activeStepId: action.stepId,
      };
    default:
      return state;
  }
}
```

- [ ] **Step 5: Run reducer tests**

Run:

```bash
npm run test -- tests/session-reducer.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add lib/artifacts/artifactTypes.ts lib/session/sessionReducer.ts tests/session-reducer.test.ts
git commit -m "Define artifact session contracts"
```

## Task 3: Build Artifact Validator And Template

**Files:**
- Create: `lib/artifacts/artifactValidator.ts`
- Create: `lib/artifacts/artifactTemplate.ts`
- Test: `tests/artifact-validator.test.ts`
- Test: `tests/artifact-template.test.ts`

- [ ] **Step 1: Write failing validator tests**

Create `tests/artifact-validator.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateSceneJavaScript } from "@/lib/artifacts/artifactValidator";

const validScene = `
const sphere = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshBasicMaterial({ color: 0x44ccff }));
root.add(sphere);
registerComponent("earth", "Earth", sphere);
registerComponent("satellite", "Satellite", sphere);
registerComponent("velocity", "Velocity Vector", sphere);
setWalkthroughSteps([
  { id: "one", title: "Gravity", caption: "Gravity pulls inward." },
  { id: "two", title: "Velocity", caption: "Velocity carries sideways." },
  { id: "three", title: "Orbit", caption: "The satellite keeps falling around Earth." },
  { id: "four", title: "Energy", caption: "Energy shapes the orbit." }
]);
`;

describe("validateSceneJavaScript", () => {
  it("accepts a scene that uses required helpers", () => {
    expect(validateSceneJavaScript(validScene).ok).toBe(true);
  });

  it("rejects full HTML output", () => {
    const result = validateSceneJavaScript(`<html><body><script>${validScene}</script></body></html>`);
    expect(result).toEqual({ ok: false, error: "Scene JavaScript must not include full HTML or script tags." });
  });

  it("rejects forbidden browser APIs", () => {
    const result = validateSceneJavaScript(`${validScene}\nlocalStorage.setItem("x", "y");`);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Forbidden API");
  });

  it("rejects arbitrary network calls", () => {
    const result = validateSceneJavaScript(`${validScene}\nfetch("https://example.com/texture.png");`);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Network calls");
  });

  it("rejects missing helper calls", () => {
    const result = validateSceneJavaScript("const x = 1;");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("registerComponent");
  });
});
```

- [ ] **Step 2: Write failing template tests**

Create `tests/artifact-template.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildArtifactHtml } from "@/lib/artifacts/artifactTemplate";

describe("buildArtifactHtml", () => {
  it("injects scene JavaScript and metadata into the fixed template", () => {
    const html = buildArtifactHtml({
      artifactId: "artifact_1",
      title: "Orbital Mechanics",
      sceneJavaScript: "setStatus('ready');",
    });

    expect(html).toContain("artifact_1");
    expect(html).toContain("Orbital Mechanics");
    expect(html).toContain("setStatus('ready');");
    expect(html).toContain("registerComponent");
    expect(html).toContain("artifact_command");
  });

  it("escapes closing script tags in generated scene code", () => {
    const html = buildArtifactHtml({
      artifactId: "artifact_1",
      title: "Safe Script",
      sceneJavaScript: "const bad = '</script>'; setStatus(bad);",
    });

    expect(html).not.toContain("const bad = '</script>'");
    expect(html).toContain("<\\/script>");
  });
});
```

- [ ] **Step 3: Run failing tests**

Run:

```bash
npm run test -- tests/artifact-validator.test.ts tests/artifact-template.test.ts
```

Expected: fail because validator and template files do not exist.

- [ ] **Step 4: Implement static validator**

Create `lib/artifacts/artifactValidator.ts`:

```ts
export type ValidationResult = { ok: true } | { ok: false; error: string };

const forbiddenMarkup = ["<script", "</script", "<html", "<body", "<iframe"];
const forbiddenApis = [
  "eval(",
  "Function(",
  "document.write",
  "localStorage",
  "sessionStorage",
  "document.cookie",
  "navigator.serviceWorker",
  "window.location",
  "top.location",
  "parent.location",
];
const forbiddenNetwork = ["fetch(", "XMLHttpRequest", "WebSocket", "EventSource", "import("];

export function validateSceneJavaScript(sceneJavaScript: string): ValidationResult {
  const source = sceneJavaScript.trim();

  if (source.length < 80) {
    return { ok: false, error: "Scene JavaScript is too short to create an interactive artifact." };
  }

  if (source.length > 70000) {
    return { ok: false, error: "Scene JavaScript exceeds the 70000 character limit." };
  }

  const lower = source.toLowerCase();
  if (forbiddenMarkup.some((token) => lower.includes(token))) {
    return { ok: false, error: "Scene JavaScript must not include full HTML or script tags." };
  }

  const forbiddenApi = forbiddenApis.find((token) => source.includes(token));
  if (forbiddenApi) {
    return { ok: false, error: `Forbidden API used in generated scene: ${forbiddenApi}` };
  }

  const networkApi = forbiddenNetwork.find((token) => source.includes(token));
  if (networkApi) {
    return { ok: false, error: `Network calls are not allowed in generated scene code: ${networkApi}` };
  }

  if (!source.includes("registerComponent(")) {
    return { ok: false, error: "Scene JavaScript must call registerComponent for clickable visual units." };
  }

  if (!source.includes("setWalkthroughSteps(")) {
    return { ok: false, error: "Scene JavaScript must call setWalkthroughSteps with at least four steps." };
  }

  const componentCallCount = source.match(/registerComponent\s*\(/g)?.length ?? 0;
  if (componentCallCount < 3) {
    return { ok: false, error: "Scene JavaScript must register at least three components." };
  }

  return { ok: true };
}
```

- [ ] **Step 5: Implement artifact template**

Create `lib/artifacts/artifactTemplate.ts`. Keep the template dependency-free and iframe-ready:

```ts
type BuildArtifactHtmlInput = {
  artifactId: string;
  title: string;
  sceneJavaScript: string;
};

function escapeScript(source: string) {
  return source.replaceAll("</script>", "<\\/script>");
}

function escapeHtml(source: string) {
  return source
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildArtifactHtml({ artifactId, title, sceneJavaScript }: BuildArtifactHtmlInput) {
  const safeTitle = escapeHtml(title);
  const safeScene = escapeScript(sceneJavaScript);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #020711; color: #e8f4ff; }
    #artifact-root { position: relative; width: 100%; height: 100%; background: radial-gradient(circle at 45% 20%, #123447 0, #06101d 45%, #020711 100%); }
    #canvas-root { width: 100%; height: 100%; }
    #chrome { position: absolute; left: 16px; right: 16px; bottom: 16px; display: flex; align-items: center; gap: 8px; z-index: 5; pointer-events: none; }
    #controls { display: flex; gap: 8px; flex-wrap: wrap; pointer-events: auto; }
    button { border: 1px solid rgba(120, 220, 255, .35); background: rgba(5, 17, 31, .76); color: #e8f4ff; min-height: 34px; border-radius: 8px; padding: 0 12px; cursor: pointer; }
    button:hover { border-color: rgba(120, 220, 255, .85); }
    #caption { margin-left: auto; max-width: min(560px, 48vw); padding: 10px 12px; border: 1px solid rgba(120, 220, 255, .24); border-radius: 10px; background: rgba(3, 10, 18, .72); color: #cfefff; font-size: 13px; line-height: 1.35; pointer-events: none; }
    #status { position: absolute; top: 16px; left: 16px; z-index: 5; padding: 8px 10px; border: 1px solid rgba(120, 220, 255, .24); border-radius: 10px; background: rgba(3, 10, 18, .72); font-size: 13px; }
  </style>
</head>
<body>
  <div id="artifact-root" data-artifact-id="${artifactId}">
    <div id="canvas-root"></div>
    <div id="status">${safeTitle}</div>
    <div id="chrome">
      <div id="controls">
        <button id="walkthrough-toggle" type="button">Start walkthrough</button>
        <button id="prev-step" type="button">Previous</button>
        <button id="next-step" type="button">Next</button>
        <button id="explode-toggle" type="button">Explode</button>
        <button id="labels-toggle" type="button">Hide labels</button>
        <button id="reset-camera" type="button">Reset camera</button>
      </div>
      <div id="caption">Use the controls or click a component to begin.</div>
    </div>
  </div>
  <script src="/three/three.min.js"></script>
  <script>
  (function loadThreeFallback() {
    if (window.THREE) return;
    var script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
    document.head.appendChild(script);
  })();
  </script>
  <script>
  (function bootArtifact() {
    var artifactId = ${JSON.stringify(artifactId)};
    var root = document.getElementById("canvas-root");
    var captionEl = document.getElementById("caption");
    var statusEl = document.getElementById("status");
    var components = new Map();
    var walkthroughSteps = [];
    var currentStepIndex = -1;
    var labelsVisible = true;
    var exploded = false;

    function post(message) {
      window.parent.postMessage(Object.assign({ artifactId: artifactId }, message), "*");
    }

    window.setStatus = function setStatus(text) {
      statusEl.textContent = String(text);
    };

    window.registerComponent = function registerComponent(id, label, object3D, metadata) {
      if (!object3D) return;
      object3D.userData = Object.assign({}, object3D.userData, { componentId: id, label: label, metadata: metadata || {} });
      components.set(id, { id: id, label: label, object3D: object3D, metadata: metadata || {} });
    };

    window.emitComponentSelected = function emitComponentSelected(id, label, metadata) {
      post({ type: "component_selected", componentId: id, label: label, metadata: metadata || {} });
    };

    window.setWalkthroughSteps = function setWalkthroughSteps(steps) {
      walkthroughSteps = Array.isArray(steps) ? steps : [];
      if (walkthroughSteps[0]) goToStep(0);
    };

    window.fitCameraTo = function fitCameraTo(target) {
      if (!window.camera || !target) return;
      var position = target.isVector3 ? target : target.position;
      if (position) {
        window.camera.position.set(position.x + 2.5, position.y + 1.5, position.z + 4);
        window.camera.lookAt(position);
      }
    };

    function goToStep(index) {
      if (!walkthroughSteps.length) return;
      currentStepIndex = Math.max(0, Math.min(walkthroughSteps.length - 1, index));
      var step = walkthroughSteps[currentStepIndex];
      captionEl.textContent = step.caption || step.title || "";
      post({ type: "walkthrough_step_changed", stepId: step.id, title: step.title || step.id });
      if (typeof window.onWalkthroughStep === "function") window.onWalkthroughStep(step, currentStepIndex);
    }

    window.addEventListener("message", function receiveParentMessage(event) {
      var data = event.data || {};
      if (data.type !== "artifact_command" || data.artifactId !== artifactId) return;
      var command = data.command || {};
      if (command.type === "focus_component") {
        var component = components.get(command.componentId);
        if (component) {
          window.fitCameraTo(component.object3D);
          window.emitComponentSelected(component.id, component.label, component.metadata);
        }
      }
      if (command.type === "go_to_step") {
        var stepIndex = walkthroughSteps.findIndex(function(step) { return step.id === command.stepId; });
        if (stepIndex >= 0) goToStep(stepIndex);
      }
      if (command.type === "reset_camera" && typeof window.resetCamera === "function") window.resetCamera();
      if (command.type === "start_walkthrough" && typeof window.startWalkthrough === "function") window.startWalkthrough();
      if (command.type === "pause_walkthrough" && typeof window.pauseWalkthrough === "function") window.pauseWalkthrough();
      if (command.type === "explode" && typeof window.setExploded === "function") { exploded = true; window.setExploded(true); }
      if (command.type === "collapse" && typeof window.setExploded === "function") { exploded = false; window.setExploded(false); }
      if (command.type === "toggle_labels" && typeof window.setLabelsVisible === "function") {
        labelsVisible = Boolean(command.visible);
        window.setLabelsVisible(labelsVisible);
      }
    });

    document.getElementById("prev-step").onclick = function() { goToStep(currentStepIndex - 1); };
    document.getElementById("next-step").onclick = function() { goToStep(currentStepIndex + 1); };
    document.getElementById("reset-camera").onclick = function() { if (typeof window.resetCamera === "function") window.resetCamera(); };
    document.getElementById("explode-toggle").onclick = function(event) {
      exploded = !exploded;
      event.currentTarget.textContent = exploded ? "Collapse" : "Explode";
      if (typeof window.setExploded === "function") window.setExploded(exploded);
    };
    document.getElementById("labels-toggle").onclick = function(event) {
      labelsVisible = !labelsVisible;
      event.currentTarget.textContent = labelsVisible ? "Hide labels" : "Show labels";
      if (typeof window.setLabelsVisible === "function") window.setLabelsVisible(labelsVisible);
    };
    document.getElementById("walkthrough-toggle").onclick = function(event) {
      if (typeof window.startWalkthrough === "function") window.startWalkthrough();
      event.currentTarget.textContent = "Pause walkthrough";
    };

    try {
      ${safeScene}
      post({ type: "artifact_ready" });
    } catch (error) {
      post({ type: "artifact_error", message: error instanceof Error ? error.message : String(error) });
    }
  })();
  </script>
</body>
</html>`;
}
```

- [ ] **Step 6: Run artifact tests**

Run:

```bash
npm run test -- tests/artifact-validator.test.ts tests/artifact-template.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add lib/artifacts/artifactValidator.ts lib/artifacts/artifactTemplate.ts tests/artifact-validator.test.ts tests/artifact-template.test.ts
git commit -m "Add sandbox artifact template validation"
```

## Task 4: Implement Message Bridge Contracts

**Files:**
- Create: `lib/artifacts/messageBridge.ts`
- Test: `tests/message-bridge.test.ts`

- [ ] **Step 1: Write failing bridge tests**

Create `tests/message-bridge.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseArtifactEvent, parseArtifactCommand } from "@/lib/artifacts/messageBridge";

describe("message bridge", () => {
  it("accepts component selected events", () => {
    expect(
      parseArtifactEvent({
        type: "component_selected",
        artifactId: "artifact_1",
        componentId: "nucleus",
        label: "Nucleus",
      }),
    ).toMatchObject({ type: "component_selected", componentId: "nucleus" });
  });

  it("rejects malformed artifact events", () => {
    expect(parseArtifactEvent({ type: "component_selected", artifactId: "artifact_1" })).toBeNull();
  });

  it("accepts tutor artifact commands", () => {
    expect(parseArtifactCommand({ type: "focus_component", componentId: "nucleus" })).toEqual({
      type: "focus_component",
      componentId: "nucleus",
    });
  });

  it("rejects unknown commands", () => {
    expect(parseArtifactCommand({ type: "delete_everything" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run failing bridge tests**

Run:

```bash
npm run test -- tests/message-bridge.test.ts
```

Expected: fail because `messageBridge.ts` does not exist.

- [ ] **Step 3: Implement bridge parsing**

Create `lib/artifacts/messageBridge.ts`:

```ts
import { z } from "zod";

export const artifactEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("component_selected"),
    artifactId: z.string().min(1),
    componentId: z.string().min(1),
    label: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    type: z.literal("walkthrough_step_changed"),
    artifactId: z.string().min(1),
    stepId: z.string().min(1),
    title: z.string().min(1),
  }),
  z.object({
    type: z.literal("artifact_ready"),
    artifactId: z.string().min(1),
  }),
  z.object({
    type: z.literal("artifact_error"),
    artifactId: z.string().min(1),
    message: z.string().min(1),
  }),
]);

export const artifactCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("focus_component"), componentId: z.string().min(1) }),
  z.object({ type: z.literal("go_to_step"), stepId: z.string().min(1) }),
  z.object({ type: z.literal("start_walkthrough") }),
  z.object({ type: z.literal("pause_walkthrough") }),
  z.object({ type: z.literal("explode") }),
  z.object({ type: z.literal("collapse") }),
  z.object({ type: z.literal("reset_camera") }),
  z.object({ type: z.literal("toggle_labels"), visible: z.boolean() }),
]);

export const parentArtifactMessageSchema = z.object({
  type: z.literal("artifact_command"),
  artifactId: z.string().min(1),
  command: artifactCommandSchema,
});

export type ArtifactEvent = z.infer<typeof artifactEventSchema>;
export type ArtifactCommand = z.infer<typeof artifactCommandSchema>;
export type ParentArtifactMessage = z.infer<typeof parentArtifactMessageSchema>;

export function parseArtifactEvent(input: unknown): ArtifactEvent | null {
  const parsed = artifactEventSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

export function parseArtifactCommand(input: unknown): ArtifactCommand | null {
  const parsed = artifactCommandSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

export function buildParentArtifactMessage(artifactId: string, command: ArtifactCommand): ParentArtifactMessage {
  return { type: "artifact_command", artifactId, command };
}
```

- [ ] **Step 4: Run bridge tests**

Run:

```bash
npm run test -- tests/message-bridge.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add lib/artifacts/messageBridge.ts tests/message-bridge.test.ts
git commit -m "Validate artifact message bridge"
```

## Task 5: Add Local Persistence

**Files:**
- Create: `lib/session/sessionStorage.ts`
- Create: `lib/session/usePersistentSession.ts`
- Modify: `components/app/ParallaxArtifactApp.tsx`
- Test: `tests/session-reducer.test.ts`

- [ ] **Step 1: Extend reducer tests for restore-safe shape**

Add this test to `tests/session-reducer.test.ts`:

```ts
import { encodeSession, parseStoredSession } from "@/lib/session/sessionStorage";
```

Add the test inside the existing `describe` block:

```ts
it("round trips persisted session state", () => {
  const withMessage = sessionReducer(createEmptySession(), { type: "user_message", content: "Teach me CRISPR" });
  const encoded = encodeSession(withMessage);
  const restored = parseStoredSession(encoded);

  expect(restored.messages[0]).toMatchObject({ role: "user", content: "Teach me CRISPR" });
});
```

- [ ] **Step 2: Run failing persistence test**

Run:

```bash
npm run test -- tests/session-reducer.test.ts
```

Expected: fail because `sessionStorage.ts` does not exist.

- [ ] **Step 3: Implement storage helpers**

Create `lib/session/sessionStorage.ts`:

```ts
import { createEmptySession } from "./sessionReducer";
import { learningSessionSchema, type LearningSession } from "@/lib/artifacts/artifactTypes";
import { z } from "zod";

const STORAGE_VERSION = 1;

const storedSessionSchema = learningSessionSchema.extend({
  version: z.number().optional(),
});

export const SESSION_STORAGE_KEY = "parallax.agentsArtifact.session.v1";

export function encodeSession(session: LearningSession): string {
  return JSON.stringify({ version: STORAGE_VERSION, ...session });
}

export function parseStoredSession(raw: string | null): LearningSession {
  if (!raw) return createEmptySession();
  try {
    const parsed = JSON.parse(raw);
    const result = storedSessionSchema.safeParse(parsed);
    if (!result.success) return createEmptySession();
    const { version: _version, ...session } = result.data;
    return session;
  } catch {
    return createEmptySession();
  }
}
```

- [ ] **Step 4: Implement persistent hook**

Create `lib/session/usePersistentSession.ts`:

```tsx
"use client";

import { useEffect, useReducer, useState } from "react";
import { createEmptySession, sessionReducer, type SessionAction } from "./sessionReducer";
import { encodeSession, parseStoredSession, SESSION_STORAGE_KEY } from "./sessionStorage";
import type { LearningSession } from "@/lib/artifacts/artifactTypes";

function initialSession(): LearningSession {
  if (typeof window === "undefined") return createEmptySession();
  return parseStoredSession(window.localStorage.getItem(SESSION_STORAGE_KEY));
}

export function usePersistentSession(): [LearningSession, React.Dispatch<SessionAction>, boolean] {
  const [hydrated, setHydrated] = useState(false);
  const [state, dispatch] = useReducer(sessionReducer, undefined, initialSession);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(SESSION_STORAGE_KEY, encodeSession(state));
  }, [hydrated, state]);

  return [state, dispatch, hydrated];
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm run test -- tests/session-reducer.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add lib/session/sessionStorage.ts lib/session/usePersistentSession.ts tests/session-reducer.test.ts
git commit -m "Persist learning session locally"
```

## Task 6: Add Agents SDK Tools And Pure Route Handlers

**Files:**
- Create: `lib/agent/tools/createExperienceTool.ts`
- Create: `lib/agent/tools/sendArtifactCommandTool.ts`
- Create: `lib/agent/prompts.ts`
- Create: `lib/agent/agents.ts`
- Create: `lib/agent/routes.ts`
- Create: `app/api/agent/chat/route.ts`
- Create: `app/api/agent/tutor/route.ts`
- Test: `tests/agent-tools.test.ts`

- [ ] **Step 1: Write tool tests**

Create `tests/agent-tools.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createExperienceFromInput } from "@/lib/agent/tools/createExperienceTool";
import { makeSendArtifactCommandSink } from "@/lib/agent/tools/sendArtifactCommandTool";

const sceneJavaScript = `
const sphere = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshBasicMaterial({ color: 0x44ccff }));
root.add(sphere);
registerComponent("earth", "Earth", sphere);
registerComponent("satellite", "Satellite", sphere);
registerComponent("velocity", "Velocity Vector", sphere);
setWalkthroughSteps([
  { id: "one", title: "Gravity", caption: "Gravity pulls inward." },
  { id: "two", title: "Velocity", caption: "Velocity carries sideways." },
  { id: "three", title: "Orbit", caption: "The satellite keeps falling around Earth." },
  { id: "four", title: "Energy", caption: "Energy shapes the orbit." }
]);
`;

describe("agent tools", () => {
  it("creates a valid artifact from create_experience input", () => {
    const result = createExperienceFromInput({
      title: "Orbital Mechanics",
      topic: "orbits",
      summary: "A visual walkthrough of stable orbits.",
      sceneJavaScript,
      walkthroughSteps: [
        { id: "one", title: "Gravity", caption: "Gravity pulls inward." },
        { id: "two", title: "Velocity", caption: "Velocity carries sideways." },
        { id: "three", title: "Orbit", caption: "The satellite keeps falling around Earth." },
        { id: "four", title: "Energy", caption: "Energy shapes the orbit." },
      ],
      components: [
        { id: "earth", label: "Earth", description: "Central body." },
        { id: "satellite", label: "Satellite", description: "Orbiting body." },
        { id: "velocity", label: "Velocity Vector", description: "Sideways motion." },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.artifact.title).toBe("Orbital Mechanics");
      expect(result.artifact.html).toContain("Orbital Mechanics");
    }
  });

  it("returns raw validation errors for invalid scene code", () => {
    const result = createExperienceFromInput({
      title: "Broken",
      topic: "broken",
      summary: "Broken artifact.",
      sceneJavaScript: "<html></html>",
      walkthroughSteps: [
        { id: "one", title: "One", caption: "One." },
        { id: "two", title: "Two", caption: "Two." },
        { id: "three", title: "Three", caption: "Three." },
        { id: "four", title: "Four", caption: "Four." },
      ],
      components: [
        { id: "a", label: "A", description: "A." },
        { id: "b", label: "B", description: "B." },
        { id: "c", label: "C", description: "C." },
      ],
    });

    expect(result).toMatchObject({ ok: false });
  });

  it("captures tutor artifact commands", async () => {
    const sink = makeSendArtifactCommandSink();
    await sink.execute({ type: "focus_component", componentId: "satellite" });

    expect(sink.getCommands()).toEqual([{ type: "focus_component", componentId: "satellite" }]);
  });
});
```

- [ ] **Step 2: Run failing tool tests**

Run:

```bash
npm run test -- tests/agent-tools.test.ts
```

Expected: fail because agent tool files do not exist.

- [ ] **Step 3: Implement create experience tool**

Create `lib/agent/tools/createExperienceTool.ts`:

```ts
import { tool } from "@openai/agents";
import { z } from "zod";
import { buildArtifactHtml } from "@/lib/artifacts/artifactTemplate";
import { createExperienceInputSchema, type ArtifactRecord, type CreateExperienceInput } from "@/lib/artifacts/artifactTypes";
import { validateSceneJavaScript } from "@/lib/artifacts/artifactValidator";

export type CreateExperienceResult =
  | { ok: true; artifact: ArtifactRecord }
  | { ok: false; error: string };

function makeArtifactId() {
  return `artifact_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createExperienceFromInput(input: CreateExperienceInput): CreateExperienceResult {
  const parsed = createExperienceInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }

  const validation = validateSceneJavaScript(parsed.data.sceneJavaScript);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  const id = makeArtifactId();
  const html = buildArtifactHtml({
    artifactId: id,
    title: parsed.data.title,
    sceneJavaScript: parsed.data.sceneJavaScript,
  });

  return {
    ok: true,
    artifact: {
      id,
      ...parsed.data,
      html,
      createdAt: new Date().toISOString(),
      validationStatus: "valid",
    },
  };
}

export function makeCreateExperienceToolSink() {
  let result: CreateExperienceResult | null = null;

  return {
    tool: tool({
      name: "create_experience",
      description:
        "Create one complete interactive Three.js STEM learning artifact. Provide proposal metadata plus scene JavaScript only; do not provide HTML.",
      parameters: createExperienceInputSchema,
      async execute(input: z.infer<typeof createExperienceInputSchema>) {
        result = createExperienceFromInput(input);
        if (!result.ok) {
          return { status: "validation_error", error: result.error };
        }
        return {
          status: "created",
          artifactId: result.artifact.id,
          title: result.artifact.title,
          walkthroughSteps: result.artifact.walkthroughSteps,
          components: result.artifact.components,
        };
      },
    }),
    getResult() {
      return result;
    },
  };
}
```

- [ ] **Step 4: Implement tutor command sink**

Create `lib/agent/tools/sendArtifactCommandTool.ts`:

```ts
import { tool } from "@openai/agents";
import { artifactCommandSchema, type ArtifactCommand } from "@/lib/artifacts/messageBridge";

export function makeSendArtifactCommandSink() {
  const commands: ArtifactCommand[] = [];

  return {
    tool: tool({
      name: "send_artifact_command",
      description: "Send a command to the active learning artifact, such as focusing a component or changing walkthrough step.",
      parameters: artifactCommandSchema,
      async execute(command: ArtifactCommand) {
        commands.push(command);
        return { status: "queued", command };
      },
    }),
    async execute(command: ArtifactCommand) {
      const parsed = artifactCommandSchema.parse(command);
      commands.push(parsed);
      return { status: "queued", command: parsed };
    },
    getCommands() {
      return commands;
    },
  };
}
```

- [ ] **Step 5: Add prompts**

Create `lib/agent/prompts.ts`:

```ts
export const ORCHESTRATOR_PROMPT = `
You are Parallax, an agent that creates interactive 3D STEM learning experiences.

When the user asks to learn, understand, visualize, simulate, or explore a STEM topic, you must call create_experience exactly once.

The create_experience tool accepts scene JavaScript only. Do not write HTML. The fixed runtime already exposes:
- THREE
- scene
- camera
- renderer
- root
- controls
- registerComponent(id, label, object3D, metadata?)
- emitComponentSelected(id, label, metadata?)
- setWalkthroughSteps(steps)
- setStatus(text)
- fitCameraTo(objectOrVector)

Generate a complete, polished, interactive Three.js learning artifact:
- Any STEM topic is allowed.
- Include at least four walkthrough steps.
- Include at least three clickable components.
- Use procedural geometry and materials.
- Use generated canvas textures or data URLs only if needed.
- Do not use fetch, external assets, document.write, eval, Function, storage, cookies, service workers, navigation, or arbitrary script tags.
- Define component focus behavior and click handling.
- Define resetCamera, setExploded, setLabelsVisible, startWalkthrough, pauseWalkthrough, and onWalkthroughStep functions when useful.

After create_experience succeeds, respond with a concise proposal summary. If validation fails, explain the raw error.
`;

export const TUTOR_PROMPT = `
You are the Parallax Tutor inside an active 3D learning room.

Use the active artifact title, walkthrough steps, components, selected component, and active step as context. Answer the user's question directly and briefly.

When helpful, call send_artifact_command to focus a component, move to a walkthrough step, start/pause walkthrough, explode/collapse, reset camera, or toggle labels. Do not regenerate or rewrite the artifact.
`;
```

- [ ] **Step 6: Add agent factories**

Create `lib/agent/agents.ts`:

```ts
import { Agent } from "@openai/agents";
import { ORCHESTRATOR_PROMPT, TUTOR_PROMPT } from "./prompts";

const model = process.env.OPENAI_MODEL ?? "gpt-5.4";

export function makeOrchestratorAgent(tools: any[]) {
  return new Agent({
    name: "Parallax Orchestrator",
    model,
    instructions: ORCHESTRATOR_PROMPT,
    tools,
  });
}

export function makeTutorAgent(tools: any[]) {
  return new Agent({
    name: "Parallax Tutor",
    model,
    instructions: TUTOR_PROMPT,
    tools,
  });
}
```

Keep `any[]` only at this SDK interop boundary. The tool inputs and route payloads remain Zod-validated.

- [ ] **Step 7: Add pure route handlers**

Create `lib/agent/routes.ts`:

```ts
import { run } from "@openai/agents";
import { z } from "zod";
import { makeOrchestratorAgent, makeTutorAgent } from "./agents";
import { makeCreateExperienceToolSink } from "./tools/createExperienceTool";
import { makeSendArtifactCommandSink } from "./tools/sendArtifactCommandTool";
import { artifactRecordSchema, chatMessageSchema, selectedComponentSchema } from "@/lib/artifacts/artifactTypes";

export const chatRouteRequestSchema = z.object({
  message: z.string().min(1),
  messages: z.array(chatMessageSchema).default([]),
});

export const tutorRouteRequestSchema = z.object({
  message: z.string().min(1),
  artifact: artifactRecordSchema,
  messages: z.array(chatMessageSchema).default([]),
  selectedComponent: selectedComponentSchema.nullable(),
  activeStepId: z.string().nullable(),
});

function requireOpenAiKey() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required to run the Parallax Agents SDK harness.");
  }
}

export async function handleChatRoute(input: unknown) {
  requireOpenAiKey();
  const request = chatRouteRequestSchema.parse(input);
  const createExperience = makeCreateExperienceToolSink();
  const agent = makeOrchestratorAgent([createExperience.tool]);

  const result = await run(agent, request.message, { maxTurns: 8 });
  const artifactResult = createExperience.getResult();

  if (artifactResult && !artifactResult.ok) {
    return {
      message: artifactResult.error,
      trace: ["Planning learning experience", "Generating interactive 3D artifact", "Validating artifact contract"],
      artifact: null,
      error: artifactResult.error,
    };
  }

  return {
    message: result.finalOutput ?? "Experience created.",
    trace: ["Planning learning experience", "Generating interactive 3D artifact", "Validating artifact contract"],
    artifact: artifactResult?.ok ? artifactResult.artifact : null,
    error: artifactResult ? null : "The agent did not call create_experience.",
  };
}

export async function handleTutorRoute(input: unknown) {
  requireOpenAiKey();
  const request = tutorRouteRequestSchema.parse(input);
  const commandSink = makeSendArtifactCommandSink();
  const agent = makeTutorAgent([commandSink.tool]);
  const step = request.artifact.walkthroughSteps.find((item) => item.id === request.activeStepId) ?? null;

  const context = JSON.stringify({
    artifact: {
      title: request.artifact.title,
      topic: request.artifact.topic,
      summary: request.artifact.summary,
      walkthroughSteps: request.artifact.walkthroughSteps,
      components: request.artifact.components,
    },
    selectedComponent: request.selectedComponent,
    activeStep: step,
  });

  const result = await run(agent, `Context:\n${context}\n\nUser question:\n${request.message}`, { maxTurns: 6 });

  return {
    message: result.finalOutput ?? "I can help with this artifact.",
    commands: commandSink.getCommands(),
  };
}
```

- [ ] **Step 8: Add API route files**

Create `app/api/agent/chat/route.ts`:

```ts
import { NextResponse } from "next/server";
import { handleChatRoute } from "@/lib/agent/routes";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await handleChatRoute(body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown chat agent error";
    return NextResponse.json({ message, trace: [], artifact: null, error: message }, { status: 500 });
  }
}
```

Create `app/api/agent/tutor/route.ts`:

```ts
import { NextResponse } from "next/server";
import { handleTutorRoute } from "@/lib/agent/routes";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await handleTutorRoute(body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown tutor agent error";
    return NextResponse.json({ message, commands: [] }, { status: 500 });
  }
}
```

- [ ] **Step 9: Run tool tests**

Run:

```bash
npm run test -- tests/agent-tools.test.ts
```

Expected: pass.

- [ ] **Step 10: Run TypeScript build**

Run:

```bash
npm run build
```

Expected: build succeeds with the SDK interop boundary isolated in `lib/agent/agents.ts`.

- [ ] **Step 11: Commit**

```bash
git add lib/agent app/api/agent tests/agent-tools.test.ts
git commit -m "Wire Agents SDK harness tools"
```

## Task 7: Build Chat And Learning Room UI

**Files:**
- Modify: `components/app/ParallaxArtifactApp.tsx`
- Create: `components/chat/ChatComposer.tsx`
- Create: `components/chat/ChatThread.tsx`
- Create: `components/chat/ExperienceProposalCard.tsx`
- Create: `components/experience/ArtifactFrame.tsx`
- Create: `components/experience/CodeInspector.tsx`
- Create: `components/experience/LearningRoom.tsx`
- Create: `components/experience/CollapsedArtifactPreview.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Create chat composer**

Create `components/chat/ChatComposer.tsx`:

```tsx
"use client";

import { Send } from "lucide-react";
import { useState } from "react";

type ChatComposerProps = {
  disabled?: boolean;
  placeholder: string;
  onSubmit: (message: string) => void;
};

export function ChatComposer({ disabled = false, placeholder, onSubmit }: ChatComposerProps) {
  const [value, setValue] = useState("");

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
  }

  return (
    <div className="composer">
      <textarea
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
      />
      <button aria-label="Send message" disabled={disabled || !value.trim()} onClick={submit}>
        <Send size={18} />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create proposal card**

Create `components/chat/ExperienceProposalCard.tsx`:

```tsx
"use client";

import { Box, ExternalLink } from "lucide-react";
import type { ArtifactRecord } from "@/lib/artifacts/artifactTypes";

type ExperienceProposalCardProps = {
  artifact: ArtifactRecord;
  onEnter: (artifactId: string) => void;
};

export function ExperienceProposalCard({ artifact, onEnter }: ExperienceProposalCardProps) {
  return (
    <article className="proposal-card">
      <div className="proposal-heading">
        <Box size={18} />
        <div>
          <h3>{artifact.title}</h3>
          <p>{artifact.summary}</p>
        </div>
      </div>
      <div className="proposal-grid">
        <section>
          <h4>Walkthrough</h4>
          <ol>
            {artifact.walkthroughSteps.map((step) => (
              <li key={step.id}>{step.title}</li>
            ))}
          </ol>
        </section>
        <section>
          <h4>Interactive parts</h4>
          <div className="component-chip-list">
            {artifact.components.map((component) => (
              <span key={component.id}>{component.label}</span>
            ))}
          </div>
        </section>
      </div>
      <button className="primary-action" onClick={() => onEnter(artifact.id)}>
        Enter Experience <ExternalLink size={16} />
      </button>
    </article>
  );
}
```

- [ ] **Step 3: Create chat thread**

Create `components/chat/ChatThread.tsx`:

```tsx
"use client";

import type { ArtifactRecord, ChatMessage } from "@/lib/artifacts/artifactTypes";
import { ExperienceProposalCard } from "./ExperienceProposalCard";

type ChatThreadProps = {
  messages: ChatMessage[];
  artifacts: Record<string, ArtifactRecord>;
  onEnterExperience: (artifactId: string) => void;
};

export function ChatThread({ messages, artifacts, onEnterExperience }: ChatThreadProps) {
  return (
    <div className="chat-thread">
      {messages.map((message) => {
        const artifact = message.artifactId ? artifacts[message.artifactId] : null;
        return (
          <div className={`chat-message chat-message-${message.role}`} key={message.id}>
            <div className="message-role">{message.role === "user" ? "You" : message.role === "assistant" ? "Parallax" : "Event"}</div>
            <div className="message-content">{message.content}</div>
            {artifact && message.role === "assistant" ? (
              <ExperienceProposalCard artifact={artifact} onEnter={onEnterExperience} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Create code inspector**

Create `components/experience/CodeInspector.tsx`:

```tsx
"use client";

type CodeInspectorProps = {
  title: string;
  html: string;
  open: boolean;
  onClose: () => void;
};

export function CodeInspector({ title, html, open, onClose }: CodeInspectorProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`${title} generated HTML`}>
      <div className="code-modal">
        <header>
          <h2>{title}</h2>
          <button onClick={onClose}>Close</button>
        </header>
        <pre>
          <code>{html}</code>
        </pre>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create artifact frame**

Create `components/experience/ArtifactFrame.tsx`:

```tsx
"use client";

import { Download, FileCode } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ArtifactRecord } from "@/lib/artifacts/artifactTypes";
import { buildParentArtifactMessage, parseArtifactEvent, type ArtifactCommand } from "@/lib/artifacts/messageBridge";
import { CodeInspector } from "./CodeInspector";

type ArtifactFrameProps = {
  artifact: ArtifactRecord;
  pendingCommands: ArtifactCommand[];
  onComponentSelected: (component: { id: string; label: string; metadata?: Record<string, unknown> }) => void;
  onStepChanged: (stepId: string, title: string) => void;
  onArtifactError: (message: string) => void;
};

export function ArtifactFrame({ artifact, pendingCommands, onComponentSelected, onStepChanged, onArtifactError }: ArtifactFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [inspecting, setInspecting] = useState(false);

  useEffect(() => {
    function receive(event: MessageEvent) {
      const parsed = parseArtifactEvent(event.data);
      if (!parsed || parsed.artifactId !== artifact.id) return;
      if (parsed.type === "component_selected") {
        onComponentSelected({ id: parsed.componentId, label: parsed.label, metadata: parsed.metadata });
      }
      if (parsed.type === "walkthrough_step_changed") {
        onStepChanged(parsed.stepId, parsed.title);
      }
      if (parsed.type === "artifact_error") {
        onArtifactError(parsed.message);
      }
    }

    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [artifact.id, onArtifactError, onComponentSelected, onStepChanged]);

  useEffect(() => {
    const target = iframeRef.current?.contentWindow;
    if (!target) return;
    for (const command of pendingCommands) {
      target.postMessage(buildParentArtifactMessage(artifact.id, command), "*");
    }
  }, [artifact.id, pendingCommands]);

  function downloadHtml() {
    const blob = new Blob([artifact.html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${artifact.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.html`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="artifact-stage">
      <header className="artifact-toolbar">
        <div>
          <p>Learning room</p>
          <h2>{artifact.title}</h2>
        </div>
        <div className="toolbar-actions">
          <button onClick={() => setInspecting(true)}>
            <FileCode size={16} /> Inspect
          </button>
          <button onClick={downloadHtml}>
            <Download size={16} /> Download
          </button>
        </div>
      </header>
      <iframe ref={iframeRef} title={artifact.title} srcDoc={artifact.html} sandbox="allow-scripts" />
      <CodeInspector title={artifact.title} html={artifact.html} open={inspecting} onClose={() => setInspecting(false)} />
    </section>
  );
}
```

- [ ] **Step 6: Create learning room**

Create `components/experience/LearningRoom.tsx`:

```tsx
"use client";

import type { ArtifactRecord, ChatMessage, SelectedComponent } from "@/lib/artifacts/artifactTypes";
import type { ArtifactCommand } from "@/lib/artifacts/messageBridge";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatThread } from "@/components/chat/ChatThread";
import { ArtifactFrame } from "./ArtifactFrame";

type LearningRoomProps = {
  artifact: ArtifactRecord;
  messages: ChatMessage[];
  artifacts: Record<string, ArtifactRecord>;
  pendingCommands: ArtifactCommand[];
  selectedComponent: SelectedComponent | null;
  busy: boolean;
  onExit: () => void;
  onTutorMessage: (message: string) => void;
  onComponentSelected: (component: SelectedComponent) => void;
  onStepChanged: (stepId: string, title: string) => void;
  onArtifactError: (message: string) => void;
  onEnterExperience: (artifactId: string) => void;
};

export function LearningRoom({
  artifact,
  messages,
  artifacts,
  pendingCommands,
  selectedComponent,
  busy,
  onExit,
  onTutorMessage,
  onComponentSelected,
  onStepChanged,
  onArtifactError,
  onEnterExperience,
}: LearningRoomProps) {
  return (
    <main className="learning-room">
      <ArtifactFrame
        artifact={artifact}
        pendingCommands={pendingCommands}
        onComponentSelected={onComponentSelected}
        onStepChanged={onStepChanged}
        onArtifactError={onArtifactError}
      />
      <aside className="room-chat">
        <header>
          <button onClick={onExit}>Exit</button>
          <div>
            <p>Selected</p>
            <strong>{selectedComponent?.label ?? "None"}</strong>
          </div>
        </header>
        <ChatThread messages={messages} artifacts={artifacts} onEnterExperience={onEnterExperience} />
        <ChatComposer disabled={busy} placeholder="Ask about the current step or selected component" onSubmit={onTutorMessage} />
      </aside>
    </main>
  );
}
```

- [ ] **Step 7: Create collapsed preview**

Create `components/experience/CollapsedArtifactPreview.tsx`:

```tsx
"use client";

import { Box } from "lucide-react";
import type { ArtifactRecord } from "@/lib/artifacts/artifactTypes";

type CollapsedArtifactPreviewProps = {
  artifact: ArtifactRecord;
  onEnter: (artifactId: string) => void;
};

export function CollapsedArtifactPreview({ artifact, onEnter }: CollapsedArtifactPreviewProps) {
  return (
    <button className="collapsed-artifact" onClick={() => onEnter(artifact.id)}>
      <Box size={18} />
      <span>{artifact.title}</span>
    </button>
  );
}
```

- [ ] **Step 8: Wire top-level app**

Replace `components/app/ParallaxArtifactApp.tsx` with a stateful client app that calls the API routes:

```tsx
"use client";

import { useState } from "react";
import type { ArtifactCommand } from "@/lib/artifacts/messageBridge";
import { usePersistentSession } from "@/lib/session/usePersistentSession";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatThread } from "@/components/chat/ChatThread";
import { LearningRoom } from "@/components/experience/LearningRoom";
import { CollapsedArtifactPreview } from "@/components/experience/CollapsedArtifactPreview";
import type { ArtifactRecord, SelectedComponent } from "@/lib/artifacts/artifactTypes";

export function ParallaxArtifactApp() {
  const [state, dispatch, hydrated] = usePersistentSession();
  const [busy, setBusy] = useState(false);
  const [trace, setTrace] = useState<string[]>([]);
  const [pendingCommands, setPendingCommands] = useState<ArtifactCommand[]>([]);
  const activeArtifact = state.activeArtifactId ? state.artifacts[state.activeArtifactId] : null;
  const collapsedArtifact = state.collapsedArtifactId ? state.artifacts[state.collapsedArtifactId] : null;

  async function sendChatMessage(message: string) {
    dispatch({ type: "user_message", content: message });
    setBusy(true);
    setTrace(["Planning learning experience"]);
    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, messages: state.messages }),
      });
      const payload = await response.json();
      setTrace(payload.trace ?? []);
      if (payload.artifact) {
        dispatch({ type: "artifact_created", artifact: payload.artifact as ArtifactRecord });
      } else {
        dispatch({ type: "assistant_message", content: payload.message ?? payload.error ?? "No artifact was created." });
      }
    } finally {
      setBusy(false);
    }
  }

  async function sendTutorMessage(message: string) {
    if (!activeArtifact) return;
    dispatch({ type: "user_message", content: message });
    setBusy(true);
    try {
      const response = await fetch("/api/agent/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          artifact: activeArtifact,
          messages: state.messages,
          selectedComponent: state.selectedComponent,
          activeStepId: state.activeStepId,
        }),
      });
      const payload = await response.json();
      dispatch({ type: "assistant_message", content: payload.message ?? "I can help with this experience." });
      setPendingCommands(payload.commands ?? []);
    } finally {
      setBusy(false);
    }
  }

  if (!hydrated) {
    return <main className="lab-shell" />;
  }

  if (state.mode === "learning_room" && activeArtifact) {
    return (
      <LearningRoom
        artifact={activeArtifact}
        messages={state.messages}
        artifacts={state.artifacts}
        pendingCommands={pendingCommands}
        selectedComponent={state.selectedComponent}
        busy={busy}
        onExit={() => dispatch({ type: "exit_experience" })}
        onTutorMessage={sendTutorMessage}
        onComponentSelected={(component: SelectedComponent) =>
          dispatch({ type: "component_selected", artifactId: activeArtifact.id, component })
        }
        onStepChanged={(stepId, title) => dispatch({ type: "walkthrough_step_changed", artifactId: activeArtifact.id, stepId, title })}
        onArtifactError={(message) => dispatch({ type: "system_event", artifactId: activeArtifact.id, content: `Artifact error: ${message}` })}
        onEnterExperience={(artifactId) => dispatch({ type: "enter_experience", artifactId })}
      />
    );
  }

  return (
    <main className="lab-shell">
      <section className="chat-home">
        <div className="lab-mark">Parallax</div>
        <h1>What do you want to understand in 3D?</h1>
        <ChatThread messages={state.messages} artifacts={state.artifacts} onEnterExperience={(artifactId) => dispatch({ type: "enter_experience", artifactId })} />
        {trace.length ? (
          <div className="build-trace">
            {trace.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        ) : null}
        {collapsedArtifact ? <CollapsedArtifactPreview artifact={collapsedArtifact} onEnter={(artifactId) => dispatch({ type: "enter_experience", artifactId })} /> : null}
        <ChatComposer disabled={busy} placeholder="Ask to learn any STEM topic" onSubmit={sendChatMessage} />
      </section>
    </main>
  );
}
```

- [ ] **Step 9: Replace global CSS**

Replace `app/globals.css` with styling for the futuristic learning lab. Keep all UI responsive and ensure the canvas remains dominant in learning room:

```css
:root {
  --bg: #020711;
  --panel: rgba(5, 14, 26, 0.88);
  --panel-strong: rgba(8, 22, 38, 0.96);
  --line: rgba(127, 219, 255, 0.2);
  --line-strong: rgba(127, 219, 255, 0.42);
  --text: #edf8ff;
  --muted: #88a9ba;
  --cyan: #70e4ff;
  --green: #65f6c2;
  --amber: #f7c86b;
  --danger: #ff6f91;
}

* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body {
  background:
    radial-gradient(circle at 20% 10%, rgba(36, 119, 158, .28), transparent 28%),
    radial-gradient(circle at 80% 0%, rgba(84, 255, 194, .12), transparent 24%),
    var(--bg);
  color: var(--text);
  font-family: Arial, Helvetica, sans-serif;
}
button, textarea { font: inherit; }
button {
  border: 1px solid var(--line);
  background: rgba(6, 18, 32, .86);
  color: var(--text);
  min-height: 36px;
  border-radius: 8px;
  padding: 0 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
button:hover { border-color: var(--cyan); }
button:disabled { cursor: not-allowed; opacity: .52; }
.lab-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 28px;
}
.chat-home {
  width: min(840px, 100%);
  min-height: min(820px, calc(100vh - 56px));
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.lab-mark {
  width: fit-content;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 8px 12px;
  color: var(--green);
  background: rgba(4, 12, 22, .68);
}
h1 { font-size: clamp(32px, 5vw, 64px); line-height: 1; margin: 0; max-width: 760px; }
.muted, .message-role { color: var(--muted); }
.chat-thread { flex: 1; display: flex; flex-direction: column; gap: 14px; overflow: auto; padding-right: 4px; }
.chat-message {
  border: 1px solid var(--line);
  background: rgba(5, 14, 26, .58);
  border-radius: 14px;
  padding: 14px;
}
.chat-message-user { margin-left: auto; max-width: 76%; border-color: rgba(112, 228, 255, .34); }
.chat-message-assistant { max-width: 92%; }
.chat-message-system_event { align-self: center; padding: 8px 12px; color: var(--muted); font-size: 13px; }
.message-role { font-size: 12px; margin-bottom: 6px; }
.message-content { white-space: pre-wrap; line-height: 1.45; }
.composer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 46px;
  gap: 10px;
  border: 1px solid var(--line-strong);
  background: rgba(5, 14, 26, .86);
  border-radius: 16px;
  padding: 10px;
}
.composer textarea {
  width: 100%;
  min-height: 54px;
  max-height: 160px;
  resize: vertical;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
}
.build-trace { display: flex; flex-wrap: wrap; gap: 8px; }
.build-trace span {
  border: 1px solid var(--line);
  background: rgba(8, 22, 38, .72);
  border-radius: 999px;
  padding: 6px 10px;
  color: var(--muted);
  font-size: 13px;
}
.proposal-card {
  margin-top: 12px;
  border: 1px solid var(--line-strong);
  background: linear-gradient(135deg, rgba(10, 31, 53, .92), rgba(5, 14, 26, .92));
  border-radius: 14px;
  padding: 16px;
}
.proposal-heading { display: flex; gap: 12px; align-items: flex-start; }
.proposal-heading h3 { margin: 0 0 6px; }
.proposal-heading p { margin: 0; color: var(--muted); }
.proposal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 14px 0; }
.proposal-grid h4 { margin: 0 0 8px; color: var(--cyan); }
.proposal-grid ol { margin: 0; padding-left: 20px; }
.component-chip-list { display: flex; flex-wrap: wrap; gap: 8px; }
.component-chip-list span {
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 6px 9px;
  color: var(--green);
}
.primary-action { border-color: var(--green); color: #06120e; background: var(--green); font-weight: 700; }
.collapsed-artifact {
  align-self: flex-start;
  border-color: var(--cyan);
  color: var(--cyan);
}
.learning-room {
  height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1.72fr) minmax(340px, .58fr);
  overflow: hidden;
}
.artifact-stage {
  min-width: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border-right: 1px solid var(--line);
  background: #020711;
}
.artifact-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--line);
  background: var(--panel);
}
.artifact-toolbar p { margin: 0; color: var(--muted); font-size: 12px; }
.artifact-toolbar h2 { margin: 2px 0 0; font-size: 18px; }
.toolbar-actions { display: flex; gap: 8px; }
.artifact-stage iframe {
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
}
.room-chat {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  background: var(--panel-strong);
}
.room-chat > header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid var(--line);
  padding-bottom: 12px;
}
.room-chat > header p { margin: 0; color: var(--muted); font-size: 12px; }
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, .72);
  display: grid;
  place-items: center;
  z-index: 20;
}
.code-modal {
  width: min(1040px, calc(100vw - 32px));
  height: min(760px, calc(100vh - 32px));
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border: 1px solid var(--line-strong);
  border-radius: 14px;
  background: #06101d;
  overflow: hidden;
}
.code-modal header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid var(--line);
}
.code-modal h2 { margin: 0; font-size: 16px; }
.code-modal pre { margin: 0; padding: 14px; overflow: auto; color: #d9f7ff; }
@media (max-width: 900px) {
  .learning-room { grid-template-columns: 1fr; grid-template-rows: 58vh 42vh; }
  .artifact-stage { border-right: 0; border-bottom: 1px solid var(--line); }
  .proposal-grid { grid-template-columns: 1fr; }
}
```

- [ ] **Step 10: Run build**

Run:

```bash
npm run build
```

Expected: build succeeds with iframe message listeners and command posting managed by `useEffect`.

- [ ] **Step 11: Commit**

```bash
git add components app/globals.css
git commit -m "Build chat-first learning room UI"
```

## Task 8: Remove Old Deterministic Demo Surface

**Files:**
- Delete old demo, engine, panel, input, lesson, and old API files listed in File Structure.
- Modify: `README.md`
- Modify: `docs/parallax-architecture.md`

- [ ] **Step 1: Delete old user-visible demo code**

Run:

```bash
rm -f components/demo/ParallaxDemo.tsx
rm -f components/engine/Airflow.tsx components/engine/EnginePart.tsx components/engine/JetEngineModel.tsx components/engine/JetEngineScene.tsx components/engine/Labels.tsx
rm -f components/panel/AgentPanel.tsx components/panel/QuizCard.tsx
rm -f components/input/useHandTracking.ts components/input/useVoiceInput.ts
rm -f lib/engine/commands.ts lib/engine/engineConfig.ts lib/engine/lessonTypes.ts
rm -f app/api/ask/route.ts app/api/compile/route.ts app/api/lesson/route.ts app/api/quiz/route.ts
rm -f data/cached-jet-engine-lesson.json
rm -f tests/commands.test.ts tests/lesson-schema.test.ts
```

- [ ] **Step 2: Remove empty directories**

Run:

```bash
find components lib app/api data tests -type d -empty -delete
```

- [ ] **Step 3: Search for stale imports**

Run:

```bash
rg "ParallaxDemo|JetEngine|lessonTypes|engineConfig|/api/compile|/api/ask|cached-jet-engine|Vercel AI SDK|AI_GATEWAY" .
```

Expected: matches only in historical docs, approved spec, or plan files. If matches appear in runtime code or README, update them to the Agents artifact direction.

- [ ] **Step 4: Update architecture doc**

Replace `docs/parallax-architecture.md` with a concise architecture overview that points to the approved spec:

```md
# Parallax Architecture

Parallax is being rebuilt as a chat-first agentic learning product. The active architecture is documented in:

- `docs/superpowers/specs/2026-06-09-agents-artifact-learning-design.md`
- `docs/superpowers/plans/2026-06-09-agents-artifact-learning-plan.md`

## Active Product Flow

1. User starts in centered chat.
2. Orchestrator agent plans a STEM learning experience.
3. Agent calls `create_experience` with proposal metadata and generated Three.js scene JavaScript.
4. App injects the scene code into a fixed artifact template.
5. Static validation must pass before `Enter Experience` appears.
6. User enters a learning room with canvas left and chat right.
7. The iframe emits component and walkthrough events through `postMessage`.
8. The Tutor agent answers with selected component/current step context and can send artifact commands back to the iframe.

The old deterministic jet-engine template architecture is no longer the active product direction.
```

- [ ] **Step 5: Run full test suite**

Run:

```bash
npm run test
```

Expected: all tests pass.

- [ ] **Step 6: Run production build**

Run:

```bash
npm run build
```

Expected: build passes.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Remove deterministic jet engine demo"
```

## Task 9: Add Optional Exa Research Tool

**Files:**
- Modify: `lib/agent/exa.ts`
- Modify: `lib/agent/agents.ts`
- Modify: `lib/agent/routes.ts`
- Test: `tests/agent-tools.test.ts`

- [ ] **Step 1: Add Exa wrapper behavior test**

Add to `tests/agent-tools.test.ts`:

```ts
import { makeResearchToolSink } from "@/lib/agent/exa";
```

Add this test:

```ts
it("returns a graceful research fallback without EXA_API_KEY", async () => {
  const original = process.env.EXA_API_KEY;
  delete process.env.EXA_API_KEY;
  const sink = makeResearchToolSink();
  const result = await sink.execute({ query: "orbital mechanics basics" });
  process.env.EXA_API_KEY = original;

  expect(result).toMatchObject({
    status: "skipped",
  });
});
```

- [ ] **Step 2: Implement optional research tool**

Replace or create `lib/agent/exa.ts`:

```ts
import { tool } from "@openai/agents";
import Exa from "exa-js";
import { z } from "zod";

const researchInputSchema = z.object({
  query: z.string().min(1),
});

export function makeResearchToolSink() {
  const results: Array<{ title: string; url: string; summary: string }> = [];

  async function execute(input: z.infer<typeof researchInputSchema>) {
    if (!process.env.EXA_API_KEY) {
      return {
        status: "skipped" as const,
        reason: "EXA_API_KEY is not configured; continuing from model knowledge.",
        results: [],
      };
    }

    const exa = new Exa(process.env.EXA_API_KEY);
    const response = await exa.searchAndContents(input.query, {
      numResults: 4,
      summary: true,
    });

    const mapped = response.results.map((result) => ({
      title: result.title ?? result.url,
      url: result.url,
      summary: result.summary ?? "Source retrieved by Exa.",
    }));

    results.push(...mapped);
    return { status: "ok" as const, results: mapped };
  }

  return {
    tool: tool({
      name: "research_stem_topic",
      description: "Optionally retrieve concise source summaries for niche, current, or accuracy-sensitive STEM topics.",
      parameters: researchInputSchema,
      execute,
    }),
    execute,
    getResults() {
      return results;
    },
  };
}
```

- [ ] **Step 3: Register research tool with the Orchestrator**

In `lib/agent/routes.ts`, update `handleChatRoute` so it creates both tools:

```ts
const createExperience = makeCreateExperienceToolSink();
const research = makeResearchToolSink();
const agent = makeOrchestratorAgent([research.tool, createExperience.tool]);
```

Import `makeResearchToolSink`:

```ts
import { makeResearchToolSink } from "./exa";
```

- [ ] **Step 4: Add research guidance to Orchestrator prompt**

In `lib/agent/prompts.ts`, add this paragraph to `ORCHESTRATOR_PROMPT`:

```text
You have an optional research_stem_topic tool. Use it for niche, current, advanced, or accuracy-sensitive STEM topics. Skip it for common foundational topics when you can build a good experience directly. If research is skipped or unavailable, continue from model knowledge.
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm run test -- tests/agent-tools.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add lib/agent tests/agent-tools.test.ts
git commit -m "Add optional Exa research tool"
```

## Task 10: End-To-End Verification And Polish

**Files:**
- Apply the smallest code or CSS changes required by the concrete verification failures, then rerun the failed verification command before proceeding.

- [ ] **Step 1: Run all unit tests**

Run:

```bash
npm run test
```

Expected: all tests pass.

- [ ] **Step 2: Run production build**

Run:

```bash
npm run build
```

Expected: build passes.

- [ ] **Step 3: Start dev server**

Run:

```bash
npm run dev
```

Expected: Next.js prints a local URL, usually `http://localhost:3000`.

- [ ] **Step 4: Manual flow with missing key**

Open `http://localhost:3000` without `OPENAI_API_KEY`.

Expected:

- Centered chat loads.
- Sending a prompt returns a raw error mentioning `OPENAI_API_KEY`.
- App remains usable.

- [ ] **Step 5: Manual flow with real key**

Set `OPENAI_API_KEY` and restart the dev server:

```bash
OPENAI_API_KEY=... npm run dev
```

In the UI, ask:

```text
I want to learn orbital mechanics with a 3D walkthrough.
```

Expected:

- Readable trace appears.
- Proposal card appears.
- `Enter Experience` appears only when artifact validation succeeds.
- Learning room opens with artifact on the left and chat on the right.
- Walkthrough controls are visible inside iframe.
- Clicking a component creates a visible `Selected: ...` chat event.
- Asking "why is this important?" gets a Tutor answer using selected component context.
- A Tutor command focuses a component or changes step when appropriate.
- Exit returns to centered chat with a collapsed preview.
- Inspect opens generated HTML.
- Download saves an HTML file.

- [ ] **Step 6: Check responsive layout**

Resize browser below 900px.

Expected:

- Learning room stacks canvas above chat.
- Composer remains visible.
- Buttons and proposal text do not overflow.

- [ ] **Step 7: Final stale-code scan**

Run:

```bash
rg "ParallaxDemo|JetEngine|cached-jet-engine|/api/compile|/api/ask|AI_GATEWAY|Vercel AI SDK" app components lib README.md package.json
```

Expected: no matches.

- [ ] **Step 8: Commit verification fixes**

If Step 1-7 required code changes:

```bash
git add -A
git commit -m "Polish Agents artifact learning MVP"
```

If no changes were needed, do not create an empty commit.

## Self-Review

Spec coverage:

- Chat-first UI: Tasks 1 and 7.
- Proposal card with outline and `Enter Experience`: Tasks 2 and 7.
- Canvas-left learning room with chat-right panel: Task 7.
- Fixed template plus scene JavaScript: Task 3.
- Static validation: Task 3.
- Strict event and command contracts: Task 4.
- Clicked components visible in chat: Tasks 2 and 7.
- Tutor agent with artifact commands: Task 6.
- Agents SDK harness: Task 6.
- Optional Exa research: Task 9.
- localStorage persistence: Task 5.
- Inspect and download HTML: Task 7.
- Remove old deterministic demo from UX: Task 8.
- No live voice v1: not implemented; remains out of scope.

Placeholder scan:

- No `TBD`, `TODO`, or open-ended implementation steps are intended in this plan.
- Each task has exact paths, commands, expected outcomes, and code snippets for core behavior.

Type consistency:

- Artifact input uses `CreateExperienceInput`.
- Stored valid artifact uses `ArtifactRecord`.
- Iframe-to-parent events use `ArtifactEvent`.
- Parent-to-iframe commands use `ArtifactCommand`.
- Session state uses `LearningSession`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-09-agents-artifact-learning-plan.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints.
