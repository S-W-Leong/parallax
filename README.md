# Parallax

Parallax turns a plain chat request into an interactive 3D STEM learning room.

Ask for a topic in everyday language — "show me how a piston engine works" or "help me understand a water molecule" — and Parallax builds you a hands-on 3D scene to explore, with an AI tutor sitting right next to it to walk you through it.

## The Problem

STEM concepts are often spatial and dynamic — engines, molecules, orbits, circuits — but most learning materials are flat. Static textbook diagrams and walls of text make it hard to build real intuition, and good interactive 3D content is expensive and slow to create, so it rarely exists for the exact thing you're trying to learn right now.

## How We Solve It

Parallax generates an interactive 3D learning room on demand from a normal chat request — no waiting for someone to build it. Instead of just reading about a concept, you can rotate it, take it apart, step through how it works, and ask a tutor that already knows what you're looking at. The hard parts (designing the lesson, building a safe 3D scene, and checking it before it ships) are handled by a team of AI agents working behind the scenes.

## How It Works

1. You ask a question in the chat.
2. Parallax builds a lesson. Behind the scenes, a small team of AI agents plans the lesson, creates an interactive 3D model, and double-checks it before showing it to you.
3. You enter the learning room. The 3D model appears on the left and a tutor chat on the right.
4. You learn by doing. Click parts of the model, step through guided walkthroughs, and ask the tutor questions. The tutor can spin the model, highlight parts, start walkthroughs, or even rebuild the scene if you ask.

Everything the AI creates is sandboxed and checked for safety before it ever runs in your browser.

## What You Can Do

- Ask STEM questions or request a custom 3D learning room.
- Explore interactive 3D models — focus on individual parts, explode and collapse them, toggle labels, and reset the view.
- Follow step-by-step guided walkthroughs.
- Chat with a tutor that understands what you're looking at and can control the model for you.
- Ask the tutor to rebuild or tweak the scene.
- Keep a history of your conversations and learning rooms.

## Getting Started

You'll need [Node.js](https://nodejs.org/) installed and an OpenAI API key.

1. Install the dependencies


npm install


2. Add your API key

Create a file called .env.local in the project root with at least:


OPENAI_API_KEY=your-key-here


That's all you need to run the app locally. The other settings below are optional.

3. Start the app


npm run dev


Then open [http://localhost:3000](http://localhost:3000) in your browser.

## Optional Settings

Add any of these to .env.local if you want extra features:

| Setting | What it does |
| --- | --- |
| OPENAI_MODEL | Choose which model to use (defaults to `gpt-5.4-mini`). |
| EXA_API_KEY | Lets the planner pull in real sources when designing a lesson. Without it, the app just uses the model's own knowledge. |
| AWS_REGION, PARALLAX_THREADS_TABLE, PARALLAX_ARTIFACT_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY | Save your chats and learning rooms to the cloud (DynamoDB + S3). Without them, or after temporary AWS credits/keys expire, the app falls back to temporary in-memory thread storage. |

Recommended OpenAI model choices:

| Model | When to use it |
| --- | --- |
| `gpt-5.4-mini` | Default. Good cost/performance balance for guided chat, tool use, and generated Three.js lessons. |
| `gpt-5.4-nano` | Lowest-cost option for high-volume testing or simple chat, with more risk on complex artifact generation. |
| `gpt-5.4` | Higher-quality fallback when generated scenes need better reasoning or code quality. |
| `gpt-5.5` | Best quality for complex reasoning and coding, but materially more expensive. |

## Common Commands


npm run dev        # start the development server
npm run build      # build for production
npm run start      # run the production build
npm run test       # run the tests once
npm run test:watch # run the tests in watch mode


## Learn More

- Built with: Next.js, React, TypeScript, Three.js, the OpenAI Agents SDK, and AWS (optional).
- Deeper technical notes: see [docs/parallax-architecture.md](docs/parallax-architecture.md) and [AGENTS.md](AGENTS.md).
