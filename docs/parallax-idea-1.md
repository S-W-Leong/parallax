# PARALLAX
### An Agentic 3D Learning Engine — SuperAI NEXT Hackathon 2026

> *Parallax: the phenomenon where a subject appears different depending on your angle of view.*
> *PARALLAX changes the angle. Every complex topic becomes something you can see.*

---

## The Problem

Abstract concepts — CRISPR, black holes, transformer architectures, orbital mechanics — are taught the same way they were taught in 1960: static diagrams, dense text, passive video. The best learners build mental 3D models. Everyone else guesses.

PARALLAX builds those models for you. Out loud. In real time.

---

## What It Does

Type any topic. An AI agent searches the live web for accurate, up-to-date information, plans a visual curriculum, and generates a **synchronized 3D lesson** — animated scene + voice narration — from scratch. When you get a quiz question wrong, the agent detects the gap, re-plans, and teaches that step again from a different angle.

```
You: "How does RNA splicing work?"

Agent: [Searching Exa for RNA splicing mechanism...]
       [Planning lesson: 5 steps, 4 objects]
       [Emitting scene script...]
       [Step 1: Rendering pre-mRNA helix + narrating...]
       [Step 3: Quiz result — wrong on "spliceosome role"]
       [Re-teaching step 3 from structural angle...]
```

You watch it think. You watch it teach. You watch it recover.

---

## Core Agent Loop

```
PERCEIVE    → User inputs a topic
SEARCH      → Agent calls Exa to ground the lesson in real facts
PLAN        → Agent designs a curriculum: steps, objects, animations
GENERATE    → Agent emits a structured scene script (JSON, Zod-validated)
ACT         → Renderer plays the 3D lesson + ElevenLabs narrates each step
OBSERVE     → Agent presents a quiz question
RECOVER     → If wrong: agent diagnoses the missed step and re-teaches it
```

Every stage is visible in a **live activity log** on the right panel. Judges (and users) can see the agent's reasoning, tool calls, and decisions in real time.

---

## Why This Is Actually Agentic

Most "AI" hackathon projects are chat wrappers. PARALLAX is not.

| Criterion | What PARALLAX does |
|---|---|
| **Agent purpose** | Builds and adapts personalized 3D lessons autonomously |
| **Autonomy** | Plans curriculum, selects visual representations, sequences steps — no pre-authored content |
| **Tool use** | Calls Exa for fact-grounding; calls structured generation as a constrained tool |
| **Failure handling** | Validates scene output with Zod; retries invalid scripts; falls back to cached lessons |
| **Human-in-the-loop** | Learner's quiz answer is the signal; agent decides whether to advance or re-teach |
| **Orchestration** | Search → plan → render → assess → re-plan is a full multi-step agentic cycle |

---

## Technical Architecture

### The Scene Script (the key design decision)

The agent does **not** write raw code. It emits a constrained **JSON scene script** that a deterministic renderer interprets. This keeps the agentic output reliable and the demo crash-proof.

```json
{
  "title": "How RNA Splicing Works",
  "steps": [
    {
      "id": "step-1",
      "narration": "Pre-mRNA contains both exons and introns.",
      "objects": [
        { "id": "premrna", "type": "helix", "color": "#4af", "label": "pre-mRNA" }
      ],
      "animations": [
        { "target": "premrna", "action": "fadeIn", "seconds": 1 },
        { "target": "premrna", "action": "rotate", "seconds": 3 }
      ]
    }
  ],
  "quiz": {
    "question": "What is the role of the spliceosome?",
    "correct": "c",
    "options": { "a": "...", "b": "...", "c": "Removes introns", "d": "..." },
    "reteach_step": "step-3"
  }
}
```

**Renderer primitive library (~10 objects):**
`helix` · `sphere` · `arrow` · `molecule` · `wave` · `orbit` · `graph` · `particles` · `label` · `box`

**Renderer action library (~6 animations):**
`fadeIn` · `rotate` · `moveTo` · `scale` · `highlight` · `orbit`

Ten primitives is enough to teach almost anything visually.

### Stack

| Layer | Tool | Why |
|---|---|---|
| Frontend | Next.js + react-three-fiber | Declarative 3D from scene JSON |
| Agent routing | Vercel AI Gateway | Structured output (Zod-validated), sponsor credit |
| Intelligence | Exa API | Live web search — no hallucinated science |
| Voice | ElevenLabs | Per-step narration synced to scene transitions |
| Backend | AWS Lambda / App Runner | Agent API endpoint |
| Cache | AWS S3 | Pre-cached lessons for demo resilience |
| TTS fallback | AWS Polly | If ElevenLabs credits/latency degrade |
| Payments (stretch) | Stripe | Paywall for unlimited custom lesson generation |

---

## Build Plan (36 Hours)

### Phase 1 — Foundation (Hours 0–8)
- [ ] Collect + test all API keys (Exa, ElevenLabs, AWS, Vercel) — **do this in hour 1**
- [ ] Lock the Zod scene schema — this is the contract everything depends on
- [ ] Build renderer with 4–5 primitives against a **hardcoded** scene JSON
- [ ] Wire step sequencer: advance on narration completion

### Phase 2 — Voice (Hours 8–10)
- [ ] Integrate ElevenLabs narration synced to step transitions
- [ ] Hardcoded lesson plays with voice, start to finish

### Phase 3 — The Agent (Hours 10–18)
- [ ] Build agent route: Exa search tool → structured scene generation
- [ ] Replace hardcoded JSON with live agent output
- [ ] **MVP checkpoint:** type any topic → working 3D lesson

### Phase 4 — Visibility (Hours 18–20)
- [ ] Build the **activity log** panel (stream agent steps to UI)
- [ ] Log: Searching Exa → Planning steps → Rendering → Awaiting input

### Phase 5 — Deployment (Hours 20–24)
- [ ] Deploy frontend to Vercel
- [ ] Deploy agent backend to AWS
- [ ] Wire S3 lesson caching
- [ ] **Live URL working end-to-end — lock the MVP here**

### Phase 6 — The Money Shot (Hours 24–30)
- [ ] Quiz component at lesson end
- [ ] Wrong answer → agent re-plans and re-teaches the missed step
- [ ] This closes the full agentic loop and answers "failure handling" on the rubric

### Phase 7 — Demo Polish (Hours 30–33)
- [ ] Pick 2–3 "hero topics" that demo reliably: **CRISPR / Black holes / Transformer architecture**
- [ ] Error boundaries + retry on invalid agent output
- [ ] Every fallback path tested

### Phase 8 — Submission (Hours 33–36)
- [ ] Record **60–90s screen recording** of the full loop (topic → lesson → wrong answer → re-teach)
- [ ] Build `.ppt` deck — one slide per judging criterion — embed the recording
- [ ] **Submit at hour 35, not 36**

---

## Non-Negotiable Rules

1. **The renderer never executes agent-generated code.** Only parses known JSON.
2. **MVP by hour 24.** If behind, stop adding, start fixing.
3. **Three hero topics must be bulletproof** before touching anything else.
4. **Submit `.ppt` or `.keynote`** — not Google Slides, not Gamma, not a link.
5. **Screen recording is embedded** in the deck — not linked to YouTube.

---

## Fallback Table

| Risk | Fallback |
|---|---|
| Agent emits invalid scene JSON | Zod validates; auto-retry; serve cached lesson after 2 failures |
| ElevenLabs slow or out of credits | Swap to AWS Polly — same step interface, one function change |
| Live agent flaky at demo time | Demo the 3 pre-cached hero lessons from S3 |
| 3D primitives too ambitious | Spheres + arrows + labels still teach effectively |
| Re-teach loop not finished | MVP without it still demonstrates a complete agentic loop |

---

## Demo Script (90 Seconds)

> **[0:00]** "Complex topics are still taught with static diagrams. PARALLAX changes that."
>
> **[0:10]** Type: *"How does CRISPR edit DNA?"* → point at the activity log lighting up.
>
> **[0:20]** 3D lesson plays. Narration. Helix unfolds. Cas9 approaches. The room goes quiet.
>
> **[0:45]** Answer the quiz wrong on purpose → "Agent detected a gap in step 3. Re-teaching…" → corrective scene plays.
>
> **[1:10]** "Every lesson is grounded in live data via Exa. Runs on AWS and Vercel. Built in 36 hours."
>
> **[1:20]** Done.

---

## Name Origin

**PARALLAX**: the shift in apparent position of an object when viewed from a different angle. This is what PARALLAX does to knowledge — it moves you to a vantage point where what was invisible becomes obvious.

---

*Built for SuperAI NEXT Hackathon 2026 · Marina Bay Sands, Singapore · June 9–11, 2026*
