# AGENTS.md

This file is the source of truth for AI coding agents working in this repository.

<!-- BEGIN COMPOUND CODEX TOOL MAP -->
## Compound Codex Tool Mapping (Claude Compatibility)

This section maps Claude Code plugin tool references to Codex behavior.
Only this block is managed automatically.

Tool mapping:
- Read: use shell reads (cat/sed) or rg
- Write: create files via shell redirection or apply_patch
- Edit/MultiEdit: use apply_patch
- Bash: use shell_command
- Grep: use rg (fallback: grep)
- Glob: use rg --files or find
- LS: use ls via shell_command
- WebFetch/WebSearch: use curl or Context7 for library docs
- AskUserQuestion/Question: present choices as a numbered list in chat and wait for a reply number. For multi-select (multiSelect: true), accept comma-separated numbers. Never skip or auto-configure -- always wait for the user's response before proceeding.
- Task/Subagent/Parallel: run sequentially in main thread; use multi_tool_use.parallel for tool calls
- TodoWrite/TodoRead: use file-based todos in todos/ with todo-create skill
- Skill: open the referenced SKILL.md and follow it
- ExitPlanMode: ignore
<!-- END COMPOUND CODEX TOOL MAP -->

## What This Is

Parallax is a Next.js (App Router) app for agent-generated interactive 3D STEM learning rooms. A single user-facing OpenAI Agents SDK Guide Agent owns both the normal chat surface and the learning room. The Guide can answer directly, call hidden Builder/Critic artifact workers through `build_learning_artifact`, or drive the active artifact (focus components, advance walkthrough steps) via a `postMessage` bridge.

## Commands

```bash
npm run dev        # next dev (http://localhost:3000)
npm run build      # next build -- run as part of verification
npm run test       # vitest run (one-shot)
npm run test:watch # vitest watch
npx vitest run tests/artifact-validator.test.ts   # single test file
npx vitest run -t "name of test"                  # single test by name
```

Verification before claiming done: `npm run test` **and** `npm run build`.

There is no lint script. Playwright is a dev dependency but there is no configured e2e script yet (`test-results/` is Playwright output).

## Environment

- `OPENAI_API_KEY` (required) -- without it the agent route throws immediately (`requireOpenAiKey` in `lib/agent/routes.ts`).
- `OPENAI_MODEL` (optional, defaults to `gpt-5.4-mini`).
- `EXA_API_KEY` (optional) -- source grounding for the research tool; when absent/failing the Guide continues from model knowledge.

## Architecture

Full design notes live in `docs/parallax-architecture.md` (read it before changing the artifact or message contracts). The big picture:

### Three Layers, Three Trust Boundaries

1. **Browser UI** -- `components/app/ParallaxArtifactApp.tsx` is the root. Thread state lives in `useThreadSession` plus a single `LearningSession` reducer (`lib/session/sessionReducer.ts`). The session still has two UI `mode`s, `chat` and `learning_room`, but those modes are context for the Guide rather than separate agent routes.
2. **Next.js API routes** -- `app/api/agent/route.ts` is the single agent endpoint. All real logic is in `lib/agent/routes.ts` (`handleAgentRoute`, `handleAgentRouteStream`, with legacy wrapper helpers kept for tests/compatibility), which is independently unit-testable.
3. **OpenAI Agents SDK** -- `lib/agent/agents.ts` builds the Guide plus hidden Builder/Critic workers; prompts live in `lib/agent/prompts.ts`. Threaded runs pass a `ThreadAgentSession` (`lib/agent/threadAgentSession.ts`) into `run(..., { session })`. Tools use a **sink** pattern (a closure that records the tool's structured result so the route can read it after `run()`).

### The Artifact Contract

This is the most important and most fragile part of the codebase.

The model does **not** generate a full page. The `create_experience` tool receives `sceneSource` JavaScript + metadata (components, walkthrough steps). The fixed runtime in `lib/artifacts/artifactTemplate.ts` (`renderArtifactHtml`) wraps that source in a sealed HTML shell and injects globals: `THREE`, `scene`, `camera`, `renderer`, `root`, `controls`, plus `registerComponent`, `setWalkthroughSteps`, `setStatus`, `fitCameraTo`.

`lib/artifacts/artifactValidator.ts` statically rejects scene source before it ever runs: forbidden markup (`<script`, `<iframe`, etc.), network/dynamic-import APIs (`fetch`, `WebSocket`, `import(`), size bounds, JS syntax errors (compiled via `new Function`), missing `registerComponent`/`setWalkthroughSteps` calls, and component ids declared in metadata but not referenced in the source. If you change the runtime globals or required calls, update the validator **and** the prompts together.

### The Message Bridge

The sandboxed iframe and parent communicate only through typed `postMessage`. Schemas and the discriminated unions are the source of truth in `lib/artifacts/artifactTypes.ts` (Zod); helpers in `lib/artifacts/messageBridge.ts`.

- Artifact to parent events: `artifact_ready`, `component_selected`, `walkthrough_step_changed`, `artifact_error`.
- Parent to artifact commands: `focus_component`, `go_to_step`, `start_walkthrough`, `pause_walkthrough`, `reset_camera`, `explode`, `collapse`, `toggle_labels`.

The Guide's `send_artifact_command` tool emits these commands; the route returns them, the reducer enqueues them (`enqueue_commands` / `clear_pending_commands`), and `LearningRoom`/`ArtifactFrame` post them into the iframe. For rebuild/patch requests, the Guide calls `build_learning_artifact`, which creates a complete replacement artifact and swaps the active room to the new artifact.

### Key Conventions

- **Zod everywhere at boundaries.** `artifactTypes.ts` defines schemas used by both the tool input layer and runtime validation. Note the tool input schemas (`lib/agent/tools/*`) use `.nullable()` (the Agents SDK requires nullable over optional) and are then normalized to the internal `optional`/`undefined` shape -- see `normalizeToolInput` in `createExperienceTool.ts`. Follow that pattern when adding tool params.
- **One-shot artifacts (v1).** The Builder builds the complete experience in a single `create_experience` call inside `build_learning_artifact`; there is no in-place artifact editing. Rebuild/patch requests generate a complete replacement artifact instead.
- Path alias `@/*` maps to the repo root (configured in both `tsconfig.json` and `vitest.config.ts`).
- TypeScript is `strict`. Dependencies are pinned to `latest` in `package.json`.

## Tests

`tests/` holds vitest unit tests for the pure/logic layers: `artifact-validator`, `artifact-template`, `message-bridge`, `session-reducer`, `agent-tools`. New logic that crosses a trust boundary (validation, normalization, reducer transitions, bridge parsing) should get a test here rather than relying on the live agent.
