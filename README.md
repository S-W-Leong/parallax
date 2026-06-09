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
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
PARALLAX_THREADS_TABLE=
PARALLAX_ARTIFACT_BUCKET=
```

`OPENAI_API_KEY` is required for live artifact creation and learning-room chat. `OPENAI_MODEL` is optional and defaults to `gpt-5.4`. `EXA_API_KEY` is optional; when absent or failing, the Parallax Agent continues from model knowledge.

AWS variables are required for persisted chat threads and generated artifact storage. See [Parallax Architecture](docs/parallax-architecture.md) for the full deployment architecture, DynamoDB table shape, S3 bucket setup, IAM policy, and Vercel env configuration.

## Verification

```bash
npm run test
npm run build
```
