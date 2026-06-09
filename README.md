# Parallax

Parallax is a Next.js MVP for source-grounded, AI-generated 3D cutaway lessons. This demo renders a deterministic procedural jet engine, shows a visible Lesson Compiler trace, supports component-aware tutor Q&A, and replays a targeted turbine-shaft-compressor re-teach after a wrong quiz answer.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment

`EXA_API_KEY` enables live source retrieval for `POST /api/compile`. Without it, the compiler route returns the validated cached fallback lesson and records the fallback in the activity log.

Optional AWS cache variables:

```bash
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
PARALLAX_S3_BUCKET=
```

## Demo Path

1. Click `Compile with Exa`.
2. Watch the activity log show search, mechanism analysis, template mapping, validation, and cache/fallback status.
3. Step through the lesson.
4. Select the compressor.
5. Ask “Why is this important?”
6. Answer the quiz incorrectly.
7. The replay isolates compressor, shaft, and turbine.

## Verification

```bash
npm run test
npm run build
```
