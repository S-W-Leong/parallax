# Parallax: ZachD-Style AI Cutaway Tutor

Parallax is a live AI tutor that researches machines and turns them into ZachD-style interactive 3D cutaway explainers.

MVP focus:

- Hero machine: jet engine
- Visual engine: procedural React Three Fiber cutaway, no Blender required
- AI scope: critical Lesson Compiler v1, narration, quiz, selected-component Q&A, adaptive re-teach
- Interaction: select, isolate, explode, replay
- Voice: push-to-talk with text fallback
- Exa: cached by default, live-compilable through a visible compiler trace
- AWS: S3 cache and optional Polly fallback
- MediaPipe: secondary hand input, mouse/touch remains primary
- Stripe: out of MVP scope
- Stretch: generalized long-running multi-agent lesson compiler using OpenAI Agents SDK, LangGraph, or similar orchestration

See:

- `docs/superpowers/specs/2026-06-09-parallax-zachd-cutaway-design.md`
- `docs/superpowers/plans/2026-06-09-parallax-zachd-cutaway-plan.md`
