# Parallax Architecture

Parallax is split into two product modes:

1. **Lesson Compilation Mode**: the user asks what they want to learn, and the Lesson Compiler turns that request into a validated lesson artifact.
2. **Runtime Tutor Mode**: the user enters the interactive 3D cutaway experience, where the Runtime Tutor answers questions, observes selections, quizzes, and re-teaches.

## Product Flow

```mermaid
flowchart TD
  A[User asks what to learn] --> B[Lesson Compilation Mode]

  B --> C[Classify topic]
  C --> D{Matching machine template?}
  D -- yes --> E[Use jet_engine template]
  D -- no --> F[Fallback: explain supported templates]

  E --> G[Search Exa for mechanism sources]
  G --> H[Extract mechanism stages]
  H --> I[Map stages to 3D rig components]
  I --> J[Generate lesson JSON]
  J --> K[Validate with Zod]

  K -- valid --> L[Cache lesson artifact]
  K -- invalid --> M[Retry once]
  M --> K
  K -- still invalid --> N[Use cached hero lesson]

  L --> O[Show lesson plan preview]
  N --> O
  O --> P[User clicks Start Experience]
  P --> Q[Runtime Tutor Mode]

  Q --> R[3D cutaway lesson plays]
  R --> S[User selects component]
  S --> T[User asks voice/text question]
  T --> U[Runtime Tutor answers with selected context]
  R --> V[Quiz checkpoint]
  V --> W{Answer correct?}
  W -- yes --> X[Continue / complete lesson]
  W -- no --> Y[Diagnose misconception]
  Y --> Z[Trigger isolate + replay re-teach]
  Z --> R
```



## System Architecture

```mermaid
flowchart LR
  subgraph Browser[Browser / Vercel Frontend]
    UI[Next.js UI]
    Canvas[React Three Fiber Jet Engine Cutaway]
    Panel[Agent Panel]
    Voice[Push-to-talk Voice + Text Fallback]
    Mouse[Mouse / Touch Selection]
    Hand[Optional MediaPipe Hand Input]
  end

  subgraph Runtime[Runtime Tutor Layer]
    AskAPI[/api/ask]
    QuizAPI[/api/quiz]
    Tutor[Runtime Tutor Agent]
  end

  subgraph Compile[Lesson Compilation Layer]
    CompileAPI[/api/compile]
    Compiler[Lesson Compiler v1]
    Schema[Zod Lesson Schema]
    Trace[Compiler Trace Events]
  end

  subgraph Services[Sponsor / Cloud Services]
    Exa[Exa Search]
    Gateway[Vercel AI SDK / AI Gateway]
    S3[AWS S3 Lesson Cache]
    Polly[Optional AWS Polly TTS]
  end

  UI --> Panel
  UI --> Canvas
  Voice --> Panel
  Mouse --> Canvas
  Hand --> Canvas
  Canvas --> Panel

  Panel --> CompileAPI
  CompileAPI --> Compiler
  Compiler --> Exa
  Compiler --> Gateway
  Compiler --> Schema
  Compiler --> Trace
  Compiler --> S3
  Schema --> CompileAPI
  Trace --> Panel
  S3 --> CompileAPI
  CompileAPI --> UI

  Panel --> AskAPI
  Panel --> QuizAPI
  AskAPI --> Tutor
  QuizAPI --> Tutor
  Tutor --> Gateway
  Tutor --> Canvas
  Tutor --> Panel
  Polly -. fallback .-> Panel
```



## Lesson Compilation Mode

The Lesson Compiler creates the teaching artifact before the interactive experience starts. For the hackathon MVP, this is a controlled compiler for the `jet_engine` template.

```mermaid
sequenceDiagram
  participant User
  participant UI as Next.js UI
  participant Compiler as /api/compile
  participant Exa
  participant LLM as Vercel AI SDK / Gateway
  participant Zod as Zod Validator
  participant Cache as AWS S3 / Local Cache

  User->>UI: I want to learn how a jet engine works
  UI->>Compiler: POST /api/compile { topic }
  Compiler-->>UI: trace: Classifying topic
  Compiler->>Exa: Search jet engine mechanism sources
  Exa-->>Compiler: Sources + summaries
  Compiler-->>UI: trace: Extracting mechanism stages
  Compiler->>LLM: Extract stages, parts, cause/effect links
  LLM-->>Compiler: Mechanism analysis
  Compiler-->>UI: trace: Mapping to jet_engine template
  Compiler->>LLM: Generate lesson JSON constrained to template
  LLM-->>Compiler: Lesson JSON
  Compiler->>Zod: Validate components, animations, quiz, re-teach

  alt valid lesson
    Zod-->>Compiler: valid
    Compiler->>Cache: Store compiled artifact
    Compiler-->>UI: lesson + trace
    UI-->>User: Show lesson plan preview + Start Experience
  else invalid lesson
    Zod-->>Compiler: invalid
    Compiler->>LLM: Retry with validation errors
    LLM-->>Compiler: Revised lesson JSON
    Compiler->>Zod: Validate again
    alt retry valid
      Zod-->>Compiler: valid
      Compiler->>Cache: Store compiled artifact
      Compiler-->>UI: lesson + trace
    else retry invalid
      Compiler->>Cache: Load cached hero lesson
      Cache-->>Compiler: Cached lesson
      Compiler-->>UI: cached lesson + fallback trace
    end
  end
```



## Runtime Tutor Mode

Runtime Tutor Mode starts after the user clicks **Start Experience**. At this point, the app already has a validated lesson artifact, so the 3D experience can be smooth and deterministic.

```mermaid
sequenceDiagram
  participant User
  participant UI as Next.js UI
  participant Canvas as R3F Engine Cutaway
  participant Tutor as Runtime Tutor Agent
  participant Ask as /api/ask
  participant Quiz as /api/quiz
  participant LLM as Vercel AI SDK / Gateway

  User->>UI: Click Start Experience
  UI->>Canvas: Load validated lesson artifact
  Canvas-->>User: Play intake -> compression -> combustion -> turbine -> exhaust

  User->>Canvas: Select compressor
  Canvas->>UI: selectedComponentId = compressor
  User->>UI: Ask: Why is this important?
  UI->>Ask: question + selectedComponentId + currentStepId
  Ask->>Tutor: Build selected-component context
  Tutor->>LLM: Generate concise answer + optional renderer command
  LLM-->>Tutor: Answer + focus command
  Tutor-->>UI: Answer + command
  UI->>Canvas: Focus compressor
  UI-->>User: Tutor answer

  Canvas-->>UI: Quiz checkpoint
  User->>UI: Wrong answer
  UI->>Quiz: answer + quiz + lesson context
  Quiz->>Tutor: Diagnose misconception
  Tutor->>LLM: Generate re-teach command and narration
  LLM-->>Tutor: Diagnosis + startReteach command
  Tutor-->>UI: Re-teach payload
  UI->>Canvas: Isolate compressor + shaft + turbine
  Canvas-->>User: Replay turbine drives shaft drives compressor
```



## Boundary Between AI And Renderer

The AI never generates arbitrary Three.js code. It only generates validated lesson artifacts and renderer commands.

```mermaid
flowchart TD
  A[AI Output] --> B{Zod validation}
  B -- valid --> C[Lesson Artifact]
  B -- invalid --> D[Retry / fallback]
  C --> E[Renderer Command Router]
  E --> F[Known Components]
  E --> G[Known Animations]
  E --> H[Known Camera Presets]
  E --> I[Known Re-teach Sequences]

  F --> J[React Three Fiber Scene]
  G --> J
  H --> J
  I --> J

  D --> K[Cached Hero Lesson]
  K --> E
```



## Key Architectural Decisions

- **Two agent layers**: Lesson Compiler for 0-to-1 generation, Runtime Tutor for live interaction.
- **Template-first generation**: the MVP compiles lessons for a fixed `jet_engine` rig instead of generating arbitrary 3D scenes.
- **Validated lesson artifact**: the compiler outputs JSON, not code.
- **Deterministic 3D renderer**: React Three Fiber owns geometry, positions, hitboxes, animations, and camera presets.
- **Visible trace**: compilation logs are shown to judges so the agentic work is inspectable.
- **Hybrid reliability**: Exa is used live, but cached lesson fallback keeps the demo safe.
- **Input abstraction**: mouse, touch, and optional MediaPipe all emit the same component-selection events.

