# Parallax ZachD-Style Cutaway Tutor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deployed MVP of Parallax: a ZachD-style procedural jet-engine cutaway with AI-generated lesson narration, source-grounded refresh, component-aware Q&A, quiz, and targeted re-teach replay.

**Architecture:** The app is a Next.js frontend with a React Three Fiber renderer and API routes for agent orchestration. The 3D jet engine is deterministic and procedural; the AI only generates validated lesson JSON and answers using component/lesson context. Exa provides live source refresh, AWS S3 stores cached lesson JSON/audio, and MediaPipe is an optional secondary input that emits the same selection events as mouse/touch.

**Tech Stack:** Next.js, TypeScript, React Three Fiber, Three.js, Zod, Vercel AI SDK or Vercel AI Gateway, Exa API, AWS S3, optional AWS Polly, optional MediaPipe Tasks Vision.

---

## File Structure

Create this app structure from a fresh Next.js scaffold:

- `app/page.tsx` — main two-panel demo shell.
- `app/layout.tsx` — metadata and global app wrapper.
- `app/globals.css` — global layout, canvas, and panel styling.
- `app/api/lesson/route.ts` — returns cached or Exa-refreshed lesson JSON.
- `app/api/ask/route.ts` — answers user questions with selected component context.
- `app/api/quiz/route.ts` — diagnoses wrong quiz answers and returns re-teach command.
- `components/demo/ParallaxDemo.tsx` — top-level client state orchestration.
- `components/engine/JetEngineScene.tsx` — R3F canvas scene and renderer bridge.
- `components/engine/JetEngineModel.tsx` — procedural engine rig.
- `components/engine/EnginePart.tsx` — reusable selectable part wrapper.
- `components/engine/Airflow.tsx` — airflow and exhaust particles.
- `components/engine/Labels.tsx` — 3D labels and arrows.
- `components/panel/AgentPanel.tsx` — transcript, voice/text controls, sources, logs, selected component.
- `components/panel/QuizCard.tsx` — quiz UI and answer handling.
- `components/input/useVoiceInput.ts` — push-to-talk speech input abstraction.
- `components/input/useHandTracking.ts` — optional MediaPipe hand tracking abstraction.
- `lib/engine/engineConfig.ts` — fixed component IDs, positions, camera presets, explode vectors.
- `lib/engine/lessonTypes.ts` — TypeScript types and Zod schemas for lesson JSON.
- `lib/engine/commands.ts` — renderer command types and reducers.
- `lib/agent/prompts.ts` — system prompts for lesson generation, Q&A, and re-teaching.
- `lib/agent/exa.ts` — Exa search wrapper.
- `lib/aws/s3.ts` — S3 cache helpers.
- `data/cached-jet-engine-lesson.json` — fallback hero lesson.
- `tests/lesson-schema.test.ts` — validates cached lesson and schema constraints.
- `tests/commands.test.ts` — validates command reducer behavior.

## Task 1: Scaffold The App

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `app/globals.css`

- [ ] **Step 1: Create Next.js app dependencies**

Use this `package.json`:

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
    "@react-three/drei": "latest",
    "@react-three/fiber": "latest",
    "@vercel/ai": "latest",
    "ai": "latest",
    "@aws-sdk/client-s3": "latest",
    "@aws-sdk/s3-request-presigner": "latest",
    "@mediapipe/tasks-vision": "latest",
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
    "@types/three": "latest",
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

Expected: `node_modules` and `package-lock.json` are created.

- [ ] **Step 3: Add minimal app shell**

Create `app/page.tsx`:

```tsx
import { ParallaxDemo } from "@/components/demo/ParallaxDemo";

export default function Home() {
  return <ParallaxDemo />;
}
```

Create `app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Parallax",
  description: "AI-generated 3D cutaway lessons for machines",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Create `app/globals.css` with a full-viewport dark workbench layout.

- [ ] **Step 4: Verify scaffold**

Run:

```bash
npm run build
```

Expected: Next.js builds successfully or fails only because referenced components are not created yet. Continue to Task 2 before requiring a clean build.

## Task 2: Define Lesson Schema And Cached Demo Lesson

**Files:**
- Create: `lib/engine/lessonTypes.ts`
- Create: `data/cached-jet-engine-lesson.json`
- Create: `tests/lesson-schema.test.ts`

- [ ] **Step 1: Create Zod schema**

`lib/engine/lessonTypes.ts` should export:

- `componentIds`
- `cameraPresets`
- `animationIds`
- `lessonSchema`
- `type Lesson`
- `parseLesson(input: unknown): Lesson`

Allowed component IDs:

```ts
export const componentIds = [
  "fan",
  "compressor",
  "combustor",
  "turbine",
  "shaft",
  "nozzle",
  "casing",
] as const;
```

The schema must reject unknown components, camera presets, and animations.

- [ ] **Step 2: Add cached lesson**

Create a cached lesson with title `How a Jet Engine Turns Air Into Thrust`, five steps, the compressor/turbine quiz, and the re-teach animation `turbine_shaft_compressor_replay`.

- [ ] **Step 3: Add schema test**

Test that `cached-jet-engine-lesson.json` parses successfully and that an unknown component fails.

Run:

```bash
npm run test -- tests/lesson-schema.test.ts
```

Expected: tests pass.

## Task 3: Build Procedural Jet Engine Rig

**Files:**
- Create: `lib/engine/engineConfig.ts`
- Create: `components/engine/EnginePart.tsx`
- Create: `components/engine/JetEngineModel.tsx`
- Create: `components/engine/Airflow.tsx`
- Create: `components/engine/Labels.tsx`
- Create: `components/engine/JetEngineScene.tsx`

- [ ] **Step 1: Define engine config**

Create positions and explode vectors for each part:

```ts
export const engineParts = {
  fan: { label: "Fan", position: [-4, 0, 0], explode: [-0.9, 1.0, 0] },
  compressor: { label: "Compressor", position: [-2, 0, 0], explode: [-0.3, 1.15, 0] },
  combustor: { label: "Combustor", position: [0, 0, 0], explode: [0, 1.2, 0] },
  turbine: { label: "Turbine", position: [2, 0, 0], explode: [0.3, 1.15, 0] },
  shaft: { label: "Shaft", position: [0, 0, 0], explode: [0, -0.85, 0] },
  nozzle: { label: "Nozzle", position: [4, 0, 0], explode: [0.9, 1.0, 0] },
  casing: { label: "Cutaway casing", position: [0, 0, 0], explode: [0, -1.2, 0] }
} as const;
```

- [ ] **Step 2: Implement selectable part wrapper**

`EnginePart` receives `id`, `selected`, `dimmed`, `exploded`, and `onSelect`. It applies emissive highlight when selected and lowers opacity when dimmed.

- [ ] **Step 3: Implement model parts procedurally**

Use cylinders, torus segments, cones, rings, and repeated blades. Make the model visually readable before optimizing realism.

- [ ] **Step 4: Implement animations**

At minimum:

- fan spins continuously
- compressor spins continuously
- turbine spins continuously
- airflow particles move left to right
- combustor glows during combustion stage
- shaft rotates visibly during re-teach

- [ ] **Step 5: Verify visually**

Run:

```bash
npm run dev
```

Expected: the left canvas displays a nonblank jet-engine cutaway with moving parts.

## Task 4: Add Demo State And Renderer Commands

**Files:**
- Create: `lib/engine/commands.ts`
- Create: `components/demo/ParallaxDemo.tsx`
- Modify: `components/engine/JetEngineScene.tsx`
- Create: `tests/commands.test.ts`

- [ ] **Step 1: Define renderer state**

State includes:

- `selectedComponentId`
- `focusedComponents`
- `exploded`
- `currentAnimation`
- `currentStepId`
- `activityLog`

- [ ] **Step 2: Define command reducer**

Commands:

- `selectComponent`
- `focusComponents`
- `setExploded`
- `playAnimation`
- `appendLog`
- `startReteach`
- `resetView`

- [ ] **Step 3: Test reducer**

Test that `startReteach` focuses compressor, shaft, and turbine; sets animation to `turbine_shaft_compressor_replay`; and appends a log line.

- [ ] **Step 4: Wire scene to state**

`ParallaxDemo` owns the state. `JetEngineScene` receives state and dispatch callbacks.

## Task 5: Build Agent Panel And Quiz UI

**Files:**
- Create: `components/panel/AgentPanel.tsx`
- Create: `components/panel/QuizCard.tsx`
- Modify: `components/demo/ParallaxDemo.tsx`

- [ ] **Step 1: Build right panel layout**

Panel sections:

- selected component
- push-to-talk/text input
- transcript
- activity log
- source list
- quiz card
- fallback/cache status

- [ ] **Step 2: Build quiz flow**

Show the quiz after the lesson reaches the final step. Wrong answers dispatch `startReteach` after calling `/api/quiz`.

- [ ] **Step 3: Verify full UI shell**

Expected: selecting a component updates the right panel, and wrong quiz answer starts the re-teach state.

## Task 6: Add Lesson API With Cached Default And Exa Refresh

**Files:**
- Create: `lib/agent/exa.ts`
- Create: `lib/agent/prompts.ts`
- Create: `app/api/lesson/route.ts`
- Modify: `components/demo/ParallaxDemo.tsx`

- [ ] **Step 1: Implement cached default route**

`GET /api/lesson?mode=cached` returns `data/cached-jet-engine-lesson.json` after schema validation.

- [ ] **Step 2: Implement Exa wrapper**

`searchJetEngineSources()` searches for authoritative pages on turbofan engine stages, compressor/turbine shaft coupling, and thrust generation.

- [ ] **Step 3: Implement refresh route**

`GET /api/lesson?mode=refresh` calls Exa, asks the model to summarize the sources into the existing lesson schema, validates it, and falls back to cached JSON if invalid.

- [ ] **Step 4: Surface activity log**

Panel logs should show:

- loading cached lesson
- searching Exa
- grounding sources
- validating lesson JSON
- using cached fallback if needed

## Task 7: Add Component-Aware Q&A

**Files:**
- Create: `app/api/ask/route.ts`
- Modify: `components/panel/AgentPanel.tsx`
- Modify: `components/demo/ParallaxDemo.tsx`

- [ ] **Step 1: Implement ask route**

Input:

```json
{
  "question": "Why is this part important?",
  "selectedComponentId": "compressor",
  "currentStepId": "compression",
  "lessonTitle": "How a Jet Engine Turns Air Into Thrust"
}
```

Output:

```json
{
  "answer": "The compressor raises air pressure before combustion, which lets the engine release much more energy from the fuel-air mixture.",
  "suggestedCommand": {
    "type": "focusComponents",
    "componentIds": ["compressor"]
  }
}
```

- [ ] **Step 2: Apply suggested command**

If `suggestedCommand` is present and valid, dispatch it through the reducer.

- [ ] **Step 3: Verify interaction**

Select compressor, ask “Why is this important?”, and confirm the answer references compressor rather than generic jet-engine overview.

## Task 8: Add Push-To-Talk Voice Input

**Files:**
- Create: `components/input/useVoiceInput.ts`
- Modify: `components/panel/AgentPanel.tsx`

- [ ] **Step 1: Implement browser speech recognition wrapper**

Use the Web Speech API if available. State includes:

- `supported`
- `listening`
- `transcript`
- `error`
- `start()`
- `stop()`

- [ ] **Step 2: Add text fallback**

The same submit handler handles spoken transcript and typed text.

- [ ] **Step 3: Verify permissions fallback**

If voice is unsupported or blocked, the text input remains visible and functional.

## Task 9: Add Quiz Diagnosis And Re-Teach Replay API

**Files:**
- Create: `app/api/quiz/route.ts`
- Modify: `components/panel/QuizCard.tsx`
- Modify: `components/demo/ParallaxDemo.tsx`

- [ ] **Step 1: Implement quiz route**

When answer is wrong, return:

```json
{
  "correct": false,
  "diagnosis": "You missed that the turbine drives the compressor through the central shaft.",
  "command": {
    "type": "startReteach",
    "focusComponents": ["compressor", "shaft", "turbine"],
    "animation": "turbine_shaft_compressor_replay"
  },
  "narration": "Watch the shaft. Hot gas spins the turbine, the turbine turns the shaft, and the shaft drives the compressor."
}
```

- [ ] **Step 2: Apply command and transcript**

Wrong answer should isolate the three components and append the diagnosis to transcript/activity log.

- [ ] **Step 3: Verify demo money shot**

Run the whole flow from lesson start through wrong answer and re-teach replay.

## Task 10: Add Optional MediaPipe Hand Input

**Files:**
- Create: `components/input/useHandTracking.ts`
- Modify: `components/engine/JetEngineScene.tsx`
- Modify: `components/demo/ParallaxDemo.tsx`

- [ ] **Step 1: Create feature flag**

Only load MediaPipe when the user enables webcam input.

- [ ] **Step 2: Track index fingertip and pinch**

Convert MediaPipe landmarks to canvas coordinates. Detect pinch by measuring thumb-tip to index-tip distance.

- [ ] **Step 3: Hit-test against component screen boxes**

Reuse mouse/touch hitboxes. If fingertip overlaps a component and pinch is detected, dispatch `selectComponent` with source `hand`.

- [ ] **Step 4: Add fallback behavior**

If webcam permission fails, show “Hand input unavailable; mouse selection active.”

## Task 11: Add AWS Cache Layer

**Files:**
- Create: `lib/aws/s3.ts`
- Modify: `app/api/lesson/route.ts`

- [ ] **Step 1: Add environment variables**

Required only for deployed AWS cache mode:

- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `PARALLAX_S3_BUCKET`

- [ ] **Step 2: Implement read-through cache**

`getCachedLessonFromS3("jet_engine")` returns S3 JSON if available, otherwise local cached JSON.

- [ ] **Step 3: Implement refresh write**

After successful Exa refresh and schema validation, write the refreshed lesson JSON to S3.

- [ ] **Step 4: Keep local fallback**

If AWS credentials are missing or S3 fails, use local cached JSON and log the fallback.

## Task 12: Polish The 90-Second Demo Path

**Files:**
- Modify: `components/engine/JetEngineModel.tsx`
- Modify: `components/engine/Airflow.tsx`
- Modify: `components/panel/AgentPanel.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Improve visual hierarchy**

Ensure the compressor, turbine, shaft, airflow, and combustor are visually distinct.

- [ ] **Step 2: Add camera presets**

Add buttons or automated camera moves for:

- wide cutaway
- compressor focus
- turbine/shaft focus
- exhaust focus

- [ ] **Step 3: Add screen-recording mode**

Add a deterministic “Demo Run” button that advances through the scripted path without relying on live timing.

- [ ] **Step 4: Verify on desktop viewport**

Run:

```bash
npm run build
npm run dev
```

Expected: app loads, 3D canvas renders, interaction works, and full demo loop completes.

## Task 13: Deployment And Submission Package

**Files:**
- Create: `.env.example`
- Create: `README.md`
- Optional create: `docs/demo-script.md`

- [ ] **Step 1: Document required environment variables**

Include:

- `EXA_API_KEY`
- model provider key used by Vercel AI Gateway or AI SDK
- optional AWS variables

- [ ] **Step 2: Deploy to Vercel**

Run:

```bash
npm run build
```

Then deploy through Vercel.

- [ ] **Step 3: Record screen demo**

Record the flow:

1. Refresh with Exa.
2. Lesson starts.
3. Select compressor.
4. Ask selected-component question.
5. Answer quiz wrong.
6. Re-teach replay isolates compressor, shaft, turbine.

- [ ] **Step 4: Build deck**

Create `.ppt` or `.keynote` with embedded screen recording. Do not rely on a live stage demo.

## 36-Hour Timeline

### Hours 0-4

- Scaffold app.
- Build lesson schema.
- Add cached lesson.
- Start procedural engine model.

### Hours 4-10

- Finish jet-engine visual rig.
- Add selection/highlight/isolate/explode/replay state.
- Add airflow and camera presets.

### Hours 10-16

- Add panel, quiz, cached lesson flow.
- Implement wrong-answer re-teach replay.
- Full offline demo loop should work here.

### Hours 16-22

- Add Exa refresh and activity log.
- Add component-aware Q&A.
- Add push-to-talk voice with text fallback.

### Hours 22-28

- Add AWS S3 cache if credentials are ready.
- Add MediaPipe only if the core loop is already stable.
- Polish visuals and layout.

### Hours 28-32

- Freeze features.
- Add demo-run mode.
- Record the 60-90 second screen capture.

### Hours 32-36

- Build deck.
- Verify repo, deployed URL, and `.ppt`/`.keynote` package.
- Submit before the final hour.

## Self-Review

Spec coverage:

- Procedural ZachD-style jet engine: covered by Tasks 3, 4, and 12.
- AI-generated lesson/narration/quiz: covered by Tasks 2, 6, 7, and 9.
- Exa hybrid refresh: covered by Task 6.
- Component-aware agent: covered by Tasks 4, 5, and 7.
- Push-to-talk voice: covered by Task 8.
- MediaPipe as secondary input: covered by Task 10.
- AWS cache: covered by Task 11.
- Stage recording/deck: covered by Task 13.

Placeholder scan:

- No `TBD`, `TODO`, or unspecified “handle later” tasks remain.
- Stripe is explicitly out of MVP scope.
- MediaPipe is optional and does not block the main demo.

Type consistency:

- Component IDs, animation IDs, and command names match the design spec.
- Re-teach path consistently uses `turbine_shaft_compressor_replay` and focuses `compressor`, `shaft`, and `turbine`.
