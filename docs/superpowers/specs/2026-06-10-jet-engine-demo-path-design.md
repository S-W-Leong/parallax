# Jet Engine Demo Path Design

## Purpose

Parallax needs a reliable live-demo path in case the generated-agent workflow is slow, unavailable, or produces an artifact that is not ready for presentation. The demo path should look and feel like the normal product flow: the user selects a starter prompt, receives an experience proposal card, enters a learning room, interacts with the 3D artifact, and can ask the tutor follow-up questions.

Only the first starter prompt should trigger this deterministic demo path. All other starter prompts and normal composer submissions should continue through the existing `/api/agent` workflow.

## Design Direction

Use a client-side deterministic demo path:

- The first empty-chat starter prompt becomes a jet engine demo prompt.
- Clicking that starter prompt creates a local prebuilt jet-engine `ArtifactRecord`.
- The app adds a normal user message and assistant proposal message to the active thread session.
- The proposal card remains the transition point into the learning room.
- The presenter clicks "Start learning" to enter the room.
- The iframe renders the prebuilt artifact through the same `renderArtifactHtml` runtime used by generated artifacts.
- Learning-room messages for this demo artifact use local canned tutor responses and artifact commands.
- Any non-demo prompt continues to stream through the real agent route.

This keeps the demo path narrow, dependable, and easy to remove or replace after the live demo.

## Trigger Contract

The demo should be triggered by starter-prompt identity, not by fuzzy matching arbitrary user text in the composer. This avoids surprising users who type their own jet-engine prompt and expect the real workflow.

Implementation should use prompt metadata rather than comparing visible text wherever possible:

- `ChatHome` exposes starter prompts as objects with labels and an optional demo id.
- The first starter prompt has the jet-engine demo id.
- The other three starter prompts have no demo id.
- Clicking a non-demo starter prompt calls the existing chat send handler.
- Submitting text in `ChatComposer` always calls the existing chat send handler.

The visible first prompt can be concise, such as "Tour a jet engine".

## Demo Artifact

Add a small demo module that owns the full artifact payload and related helpers. The artifact should satisfy the existing artifact contract and validator expectations:

- `lessonMode`: `guided_walkthrough`
- no playground controls
- at least three registered components
- `setWalkthroughSteps` called in the scene source
- component ids in metadata are registered by the scene source
- no network calls, dynamic imports, markup injection, or unsupported globals

The artifact should model a cutaway turbofan-style engine with clear, inspectable components:

- inlet fan
- compressor
- combustor
- turbine
- exhaust nozzle
- airflow path or bypass duct

The scene should use simple Three.js primitives and materials, not external assets. It should emphasize legibility for a live audience: separated engine stages, distinct hot/cold colors, labels, and an exploded-view-friendly layout.

## Lesson Content

The proposal and room should teach the core energy flow through a jet engine:

- air enters through the inlet fan
- compressor stages raise pressure
- fuel burns in the combustor
- hot gas spins the turbine
- the shaft helps drive the fan and compressor
- exhaust accelerates through the nozzle to create thrust

Walkthrough steps should be short enough for presentation pacing and should each target one or two components. Suggested steps:

- Overview: trace air from front to back.
- Fan and inlet: draw in a large mass of air.
- Compressor: squeeze air into a smaller, higher-pressure stream.
- Combustor: mix fuel with compressed air and ignite it.
- Turbine: extract work from hot gas to drive the shaft.
- Nozzle and thrust: accelerate exhaust rearward.

Learning outcomes should be friendly and proposal-ready, for example:

- Trace air from inlet to exhaust.
- See where pressure, heat, and shaft work change.
- Connect turbine work to thrust.

## Demo Tutor

If the active artifact is the demo jet-engine artifact, learning-room chat should bypass `/api/agent` and use a local deterministic tutor helper. This prevents the live fallback from depending on OpenAI availability after the room opens.

The helper should return:

- assistant text
- zero or more artifact commands

Keyword-based responses are enough for the demo:

- "fan" or "inlet" focuses the fan component.
- "compressor" focuses the compressor component.
- "combustor", "burn", or "fuel" focuses the combustor component.
- "turbine" focuses the turbine component.
- "nozzle", "exhaust", or "thrust" focuses the nozzle component.
- "airflow", "walkthrough", or "steps" sends `start_walkthrough`.
- "explode" sends the `explode` command.
- "collapse" sends the `collapse` command.
- "reset" sends the `reset_camera` command.

The fallback response should summarize the full engine cycle and suggest a useful next component to inspect. It should stay concise so the room still feels like a tutor channel, not a static article.

## State And Persistence

The demo path should use existing session reducer actions rather than adding a parallel state model. The starter click should dispatch `user_message` followed by `artifact_created` with the demo proposal text. Canned tutor messages should dispatch `user_message`, `assistant_message`, and `enqueue_commands` as needed.

The initial demo implementation should not persist the demo artifact through the backend. Keeping it local avoids touching the existing dirty agent/storage files and makes the fallback independent of backend availability. Thread refresh may not show the demo messages after a full reload; that is acceptable for this live-demo fallback.

If persistence becomes necessary later, it should be added as a separate server-side demo route or an explicit save path.

## Error Handling

The local demo path should avoid network errors by construction. The main risks are malformed artifact data or invalid scene source. Tests should catch those before the demo.

If the demo artifact somehow fails in the iframe, the existing `artifact_error` path should show the system event. The surrounding UI should not need special demo-only error UI.

The real workflow should retain its current loading, stop, streaming, and error behavior for all non-demo prompts.

## Testing

Add focused tests for the demo contract:

- The first starter prompt is the jet-engine demo prompt.
- Only that starter prompt carries the demo id.
- The demo artifact validates through the existing artifact validator.
- The demo artifact HTML is rendered through `renderArtifactHtml`.
- The demo tutor helper maps component keywords to expected assistant text and commands.
- Non-demo prompts remain plain prompts with no demo id.

Existing verification still applies before claiming completion:

- `npm run test`
- `npm run build`

## Out Of Scope

- Persisting demo state to DynamoDB or S3.
- Replacing the generated-agent workflow for arbitrary jet-engine requests typed into the composer.
- Adding new artifact runtime commands.
- Adding external 3D assets, images, or network requests.
- Building an admin/demo toggle.
- Changing the visual design of the chat home or learning room beyond the first starter prompt label.

## Success Criteria

- A fresh empty chat shows the jet-engine demo as the first starter option.
- Clicking the jet-engine starter option shows the normal proposal card first.
- Clicking "Start learning" enters a functioning jet-engine learning room.
- The artifact renders without contacting OpenAI or external asset services.
- Canned tutor questions can focus major engine components and trigger useful room commands.
- The other three starter prompts and all composer submissions continue through the actual agent workflow.
