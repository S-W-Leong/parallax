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
