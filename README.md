# Parallax

Parallax is a chat-first Next.js app for agent-generated interactive 3D STEM learning rooms. A learner asks for a topic in plain language, the OpenAI Agents SDK plans a learning experience, optionally grounds it with Exa research, and creates a sandboxed Three.js artifact with clickable components, a guided walkthrough, and a room-aware Tutor chat.

The core bet: an agent should be able to author a complete interactive 3D learning room from a normal chat request, then keep teaching inside that room by using the learner's selected component and active walkthrough step as context.

## What It Does

- Starts in a threaded chat interface for asking STEM questions or requesting 3D learning rooms.
- Generates self-contained Three.js artifacts through a fixed Parallax runtime instead of letting the model emit a full web page.
- Validates generated scene JavaScript before it runs, rejecting unsafe markup, network APIs, dynamic imports, syntax errors, and incomplete artifact contracts.
- Presents validated artifacts as proposal cards with learning outcomes, walkthrough steps, and interactive components.
- Opens a learning room with the artifact iframe on the left and a Tutor chat on the right.
- Lets the Tutor send typed commands to the artifact: focus a component, go to a step, start or pause walkthroughs, explode or collapse the model, reset the camera, and toggle labels.
- Persists chat threads, messages, artifact metadata, generated HTML, and generated scene source with DynamoDB and S3.
- Lets users inspect and download generated artifact HTML.

## Product Flow

1. A user opens Parallax and lands in the chat console.
2. The browser creates or reads a demo user id, loads thread summaries, and hydrates the active session from `/api/threads`.
3. The user asks to learn or visualize a STEM topic.
4. `/api/agent` runs the Parallax Agent in `chat` mode with the `research_stem_topic` and `create_experience` tools.
5. If a 3D room is useful, the agent creates scene source plus structured metadata.
6. Parallax validates the scene source, wraps it in the fixed artifact runtime, uploads the artifact payload to S3, and stores metadata/messages in DynamoDB.
7. The user enters the learning room.
8. The artifact emits typed events such as component selection and walkthrough step changes.
9. Learning-room chat calls `/api/agent` in `learning_room` mode. The Tutor receives artifact context and can return both text and artifact commands.

## Architecture

Parallax has three main layers:

- **Browser UI:** `components/app/ParallaxArtifactApp.tsx` owns the app shell, thread sidebar, chat console, proposal cards, and learning-room mode. Session state flows through `lib/session/sessionReducer.ts` and `useThreadSession`.
- **Next.js API routes:** `app/api/agent/route.ts`, `app/api/threads/route.ts`, and `app/api/threads/[threadId]/route.ts` are thin route handlers. Most agent logic lives in `lib/agent/routes.ts`; thread persistence lives in `lib/cloud/threadStore.ts`.
- **OpenAI Agents SDK:** `lib/agent/agents.ts` builds the Parallax Agent. In chat mode it can research and create experiences. In learning-room mode it can send artifact commands through a sink-backed tool.

The artifact system is its own trust boundary:

- `lib/artifacts/artifactTypes.ts` defines the Zod schemas for artifacts, commands, events, and sessions.
- `lib/artifacts/artifactValidator.ts` statically validates generated scene source.
- `lib/artifacts/artifactTemplate.ts` wraps validated source in the sealed Parallax runtime.
- `lib/artifacts/messageBridge.ts` handles typed `postMessage` communication between the parent app and the sandboxed iframe.

For deeper implementation notes, see [docs/parallax-architecture.md](docs/parallax-architecture.md).

## Artifact Contract

The model does not generate a complete HTML document. The `create_experience` tool receives:

- `topic`, `title`, `summary`, and optional learning outcomes
- interactive component metadata
- walkthrough step metadata
- `sceneSource` JavaScript

The generated `sceneSource` runs inside a fixed runtime where these globals already exist:

- `THREE`
- `scene`, `camera`, `renderer`, `root`, `controls`
- `registerComponent`
- `setWalkthroughSteps`
- `setStatus`
- `fitCameraTo`

Generated scenes must register at least three meaningful components and define walkthrough steps. They cannot use arbitrary remote assets, `fetch`, WebSockets, dynamic imports, iframes, script tags, localStorage, cookies, or similar browser/network escape hatches.

## Tech Stack

- Next.js App Router
- React and TypeScript
- OpenAI Agents SDK
- Three.js
- Zod
- AWS DynamoDB and S3
- Exa search, optional
- Vitest

## Environment

Create `.env.local` with:

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4
EXA_API_KEY=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
PARALLAX_THREADS_TABLE=
PARALLAX_ARTIFACT_BUCKET=
```

`OPENAI_API_KEY` is required for live artifact creation and learning-room chat. `OPENAI_MODEL` is optional and defaults to `gpt-5.4`.

`EXA_API_KEY` is optional. When it is absent or Exa fails, the agent continues from model knowledge.

The current app uses the thread API on startup, so AWS credentials, a DynamoDB table, and an S3 bucket are required for normal persisted app usage. See [docs/parallax-architecture.md](docs/parallax-architecture.md) for table shape, bucket naming, IAM policy, and deployment notes.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Commands

```bash
npm run dev        # start the Next.js dev server
npm run build      # build the app
npm run start      # run the production build
npm run test       # run Vitest once
npm run test:watch # run Vitest in watch mode
```

## Verification

Before shipping code changes, run:

```bash
npm run test
npm run build
```
