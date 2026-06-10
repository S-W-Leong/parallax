# Parallax: AI Learning Rooms You Can Step Inside

Parallax is a chat-first learning platform that turns a student's question into an interactive 3D STEM room.

Instead of giving learners another wall of text, Parallax lets them ask for a concept, watch an AI agent design a visual learning experience, and then explore that concept as a working Three.js scene with clickable parts, guided walkthroughs, and a tutor that understands what they are looking at.

Our vision is simple: the next generation of educational AI should not only explain ideas. It should build worlds where those ideas become visible, manipulable, and memorable.

## The Problem

Most digital learning tools still separate explanation from experience.

A student can ask a chatbot how a jet engine works, but the answer usually arrives as paragraphs, diagrams, or links. They can search for a simulation, but it may not match their level, language, curriculum, or exact question. They can watch a video, but they cannot ask the combustor to come apart, zoom into the turbine, or request a simpler version of the same model.

That gap matters most in STEM. Many concepts are spatial, dynamic, and physical. Students need to see relationships, not just read definitions. Teachers need materials that adapt quickly, not static assets that take hours to prepare.

Parallax closes that gap by giving the learner an agent that can teach, build, critique, and control the learning environment in one continuous conversation.

## What We Built

Parallax begins as a familiar chat interface. A learner can type something as natural as:

> "Teach me how a jet engine works."

From that request, the Parallax Guide Agent decides whether a direct explanation is enough or whether the learner would benefit from an interactive room. When a room is useful, the agent creates a structured learning plan and calls a hidden artifact-building workflow.

That workflow generates a complete, self-contained 3D scene with:

- Meaningful interactive components, such as an intake, compressor, combustor, turbine, or nozzle.
- A guided walkthrough that breaks the topic into teachable steps.
- Labels, camera framing, and component metadata.
- A room-aware tutor chat that can respond to what the learner selects.
- Safe runtime controls such as focus, reset camera, explode view, collapse view, and label toggles.

The result is not a prebuilt demo. It is an agent-generated learning object produced from the learner's prompt, validated by the system, and then taught through conversation.

## Why It Is Agentic

Parallax is not a chatbot wrapped around a 3D viewer. The agent does real work at the center of the product.

The user-facing Guide Agent owns the learning flow. It answers normal questions, decides when to build a room, asks tools to research or construct artifacts, and continues tutoring inside the active scene. It can also send commands into the room, such as focusing a component or advancing the walkthrough when that would help the learner.

Behind the Guide is a Builder and Critic workflow. The Builder creates the scene source and lesson metadata. The Critic reviews the artifact for educational quality and contract compliance. If something is unsafe, incomplete, or poorly structured, the workflow can repair or reject it before the learner sees it.

This creates an observable agent loop:

1. Understand the learner's request.
2. Decide whether to answer, research, build, command, or rebuild.
3. Use tools to create or control the learning experience.
4. Validate and critique the generated artifact.
5. Teach with awareness of the learner's current room state.

The agent is not only producing text. It is shaping the environment where learning happens.

## The Learning Experience

Once a room is created, the learner enters a split learning space: the 3D artifact on one side and the tutor chat on the other.

The artifact can emit events when the learner selects a component or changes walkthrough steps. The tutor receives that context, so the conversation becomes grounded in the scene. A learner can ask:

- "What does this part do?"
- "Show me where combustion happens."
- "Walk me through the airflow again."
- "Make this simpler."
- "Explode the model so I can see each stage."

Parallax can then answer in words, control the artifact, or build a replacement room when the learner asks for a different version.

That is the core shift: the lesson is no longer a static artifact. It becomes a live, agent-mediated space.

## Safety and Trust

Agent-generated interactive content is powerful, but it needs guardrails. Parallax treats generated artifacts as a trust boundary.

The model does not generate a full web page. It generates scene JavaScript and structured metadata through a constrained artifact contract. Parallax wraps that scene inside a fixed runtime and validates it before execution.

The validator rejects unsafe or unsupported content, including script tags, iframes, network calls, dynamic imports, browser storage APIs, syntax errors, missing walkthroughs, and incomplete component registration. The sandboxed artifact communicates with the parent app only through typed `postMessage` events and commands.

This means Parallax can let agents create rich interactive experiences without handing over the entire browser.

## How It Works

Parallax is built with Next.js, React, TypeScript, Three.js, Zod, and the OpenAI Agents SDK.

The app has three main layers:

- **Browser UI:** a threaded chat interface, proposal cards, and a learning room with a sandboxed 3D iframe.
- **Agent API:** a single `/api/agent` route that runs the Guide Agent in either normal chat context or learning-room context.
- **Artifact runtime:** a fixed Three.js shell that injects safe globals, validates generated scene source, and handles typed communication between the iframe and parent app.

Persistence is handled with AWS DynamoDB and S3. DynamoDB stores threads, messages, sessions, and artifact metadata. S3 stores generated artifact HTML and scene source. Exa can be used for source grounding when a topic benefits from current or external information.

## What Makes Parallax Different

Parallax is designed around a belief that AI learning tools should be generative, interactive, and inspectable.

- **Generative:** rooms are created from a learner's request, not picked from a fixed library.
- **Interactive:** the tutor can control the artifact, and the artifact can inform the tutor.
- **Grounded:** the agent can use research tools for topics that need external context.
- **Safe by design:** generated scenes pass through validation before they run.
- **Teachable:** each artifact includes components, walkthrough steps, and learning outcomes, not just visual geometry.

The most exciting part is the compounding effect. Every prompt can become a new learning space. Every follow-up can change how the learner moves through that space. Every selection gives the tutor more context about what the learner is trying to understand.

## Demo Story

Our demo follows a learner exploring how a jet engine works.

The learner starts in chat and asks Parallax to teach the topic. The Guide Agent creates a jet engine learning room with labeled stages, an animated flow concept, and a guided walkthrough. The learner enters the room, selects components, asks questions, and watches the tutor focus the relevant part of the artifact.

When the learner asks to see the engine broken apart, the agent sends an artifact command. When the learner asks for a simpler version, the Guide can rebuild the room as a complete replacement artifact.

In a few minutes, the demo shows the full agentic loop: planning, building, validating, teaching, controlling, and adapting.

## Why It Matters

Learning is often strongest when explanation and exploration happen together. Parallax makes that possible on demand.

For students, it means STEM concepts can become spatial and interactive instead of abstract and intimidating. For teachers, it hints at a future where custom teaching aids can be generated in minutes. For AI, it is a step beyond chat: an agent that can create a learning environment, reason about it, and guide a human through it.

Parallax is our answer to what education can feel like when agents do more than talk.

They build the room. Then they teach inside it.
