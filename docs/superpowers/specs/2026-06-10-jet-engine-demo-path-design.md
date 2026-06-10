# Jet Engine Demo Path Design

## Purpose

Parallax needs a reliable live-demo path in case the generated-agent workflow is slow, unavailable, or produces an artifact that is not ready for presentation. The demo path should look and feel like the normal product flow: the user selects a starter prompt, receives an experience proposal card, enters a learning room, interacts with the 3D artifact, and can ask the tutor follow-up questions.

Only the first starter prompt should trigger this deterministic demo path. All other starter prompts and normal composer submissions should continue through the existing `/api/agent` workflow.

## Design Direction

Use a real-agent demo path with one deterministic artifact-scene substitution:

- The first empty-chat starter prompt becomes a jet engine demo prompt.
- Clicking that starter prompt sends the prompt through the normal `/api/agent` Guide route.
- The Guide plans the lesson and calls `build_learning_artifact` as it would for any other interactive tour.
- When that tool receives a guided jet-engine plan with the expected major engine stages, it returns the prebuilt jet-engine `ArtifactRecord` instead of asking Builder/Critic to generate a new Three.js scene.
- The proposal card remains the transition point into the learning room.
- The presenter clicks "Start learning" to enter the room.
- The iframe renders the prebuilt artifact through the same `renderArtifactHtml` runtime used by generated artifacts.
- Learning-room messages for this artifact use the normal `/api/agent` Guide route with active artifact context and real `send_artifact_command` tool calls.
- Any non-jet-engine prompt continues to use the normal artifact Builder/Critic workflow.

This keeps the only fake boundary at the 3D scene itself, while preserving the real Guide Agent, streaming, command, persistence, and room-chat behavior.

## Trigger Contract

The demo should be triggered by starter-prompt identity, not by fuzzy matching arbitrary user text in the composer. This avoids surprising users who type their own jet-engine prompt and expect the real workflow.

Implementation should not use prompt metadata to bypass the agent:

- `ChatHome` exposes starter prompts as simple objects with labels.
- Clicking any starter prompt calls the existing chat send handler.
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

The demo tutor should be the normal Guide Agent. Learning-room chat sends the fixed artifact context, selected component, active step, and message history through `/api/agent`. The Guide can answer naturally and use `send_artifact_command` for component focus, walkthrough movement, exploded view, labels, and camera reset.

There should be no local canned tutor helper for this path.

## State And Persistence

The demo path should use the existing agent route, stream handling, reducer actions, and persistence. When `build_learning_artifact` returns the fixed jet-engine artifact, the route saves it like any other generated artifact and the proposal card attaches to the assistant message normally.

## Error Handling

The local demo path should avoid network errors by construction. The main risks are malformed artifact data or invalid scene source. Tests should catch those before the demo.

If the demo artifact somehow fails in the iframe, the existing `artifact_error` path should show the system event. The surrounding UI should not need special demo-only error UI.

The real workflow should retain its current loading, stop, streaming, and error behavior for all non-demo prompts.

## Testing

Add focused tests for the demo contract:

- The first starter prompt is the jet-engine prompt and carries no local bypass metadata.
- The demo artifact validates through the existing artifact validator.
- The demo artifact HTML is rendered through `renderArtifactHtml`.
- The app exports no local tutor routing helper.
- `build_learning_artifact` returns the fixed jet-engine scene for guided jet-engine plans without running Builder/Critic.
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
- The 3D artifact scene renders without external asset services.
- Tutor questions go through the real Guide Agent and can focus major engine components or trigger useful room commands.
- The other three starter prompts and all composer submissions continue through the actual agent workflow.
