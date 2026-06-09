# Parallax Chat-First Reset Design

## Purpose

Parallax should feel simple enough for non-technical learners while keeping its green-and-white technical lab identity. The app should return to the product flow described in the architecture docs: chat first, thread history on the left, and a focused learning room when the user enters an artifact.

This design removes the dashboard-style UI that added metrics, logs, system checks, and extra panels. Those surfaces make the app feel technical and overwhelming, so they should not appear in the normal user experience.

## Design Direction

Use the Chat-First Reset approach:

- Main chat is the primary home screen.
- The left thread rail is slim by default everywhere.
- Hovering expands the rail to reveal thread titles.
- The sidebar toggle icon pins or unpins the expanded state.
- The expanded sidebar pushes the main layout sideways instead of covering content.
- Main chat has no header. The Parallax identity lives in the rail.
- The composer is anchored at the bottom, with scrollable messages above it.
- Starter prompt chips appear only when the active thread is empty.
- The refreshed monospace technical-lab feel, green/white palette, hard borders, and compact control style remain.

## Main Chat UX

The main chat screen should contain only:

- Thread rail on the left.
- Message history in the main panel.
- Empty-state guidance when there are no messages.
- Starter prompt chips in the empty state only.
- Bottom-anchored composer.
- Full proposal cards for generated learning rooms.

The following should be removed from normal main chat:

- Dashboard right rail.
- Metrics.
- Agent trace/log panel.
- System checks.
- Separate topic-intake panel above the conversation.
- Any persistent technical status panel beyond simple loading and error states.

The empty state should be warm and direct, with copy that helps a non-technical user know what to ask. Starter prompts should feel like learning prompts, not engineering demos.

## Learning Room UX

Learning mode should use a three-zone desktop layout:

- Left: the same slim, hover-expandable, pinnable thread rail.
- Center: the 3D canvas as the primary focus.
- Below the canvas: a simple walkthrough strip with previous/next controls and friendly step text.
- Right: tutor chat.

The tutor chat should show the full thread history, not only room-specific messages. This keeps context visible while learning. Artifact proposal cards inside the right-side tutor chat should render as compact "room created" rows instead of full proposal cards, because the active canvas is already open.

When the user clicks a component in the canvas, the selection should appear as a small chip above the tutor chat, such as "Selected: Combustor". The tutor should continue to receive the selected component as context.

The following should be hidden or removed from normal learning mode:

- Inspector side panel.
- Metadata list.
- Command buffer.
- Trace/log panel.
- System check panel.

The selected component chip and walkthrough strip should replace those heavier technical panels.

## Proposal Card UX

Generated learning rooms should still use a proposal-first flow. The app should not auto-enter a room.

The proposal card should be simple but preview-rich:

- Room title.
- Short plain-language summary.
- Three friendly learning outcomes, for example: "Trace airflow", "Compare hot and cold zones", "See how fuel ignites".
- Clear primary CTA: "Start learning".

The three learning outcomes should be written as user-facing outcomes, not raw component names or implementation details.

## Streaming And Loading UX

Both main chat and learning-room tutor chat should support token-by-token assistant text streaming.

When the user sends a message:

- The user message appears immediately.
- An assistant draft appears immediately.
- The draft starts with warm teacherly status text.
- Normal chat can begin with text like "Let me think this through..."
- Artifact generation should use short status steps like:
  - "I'm sketching the room..."
  - "Building the 3D scene..."
  - "Checking the lesson..."
- Real assistant text streams token by token into the draft as it arrives.
- The composer switches from Send to Stop while the request is active.
- If the user stops a response, keep the partial assistant text and mark it as stopped.
- Users should not be able to stack multiple simultaneous sends in the same chat.

For room creation, the streamed experience should be short status text first, then the final proposal card when the artifact is ready.

## Component And State Direction

Reuse and reshape the existing component tree instead of introducing a separate shell:

- `ParallaxArtifactApp` owns layout mode, sidebar pin state, active request state, and stop handling.
- `ThreadSidebar` becomes a reusable rail/sidebar with slim, hover-expanded, and pinned-expanded states.
- `ChatThread` supports proposal rendering modes:
  - full cards in main chat
  - compact rows in learning-room tutor chat
- `ChatComposer` supports send and stop controls.
- `LearningRoom` becomes the learning shell around canvas, walkthrough strip, and tutor chat.
- Add a small walkthrough strip component or simplify the current walkthrough rendering into that form.
- Add a selected-component chip above tutor chat.

Existing thread persistence should remain. Existing artifact/session reducer behavior should remain unless streaming introduces a small need for draft-message actions.

Sidebar pinned state can remain local UI state for now. It does not need persistence.

Streaming will require updating the agent request path so `/api/agent` can stream response events while still delivering artifact/proposal data at completion.

## Responsive Behavior

Desktop:

- Sidebar is slim by default.
- Hover expands it.
- Toggle icon pins or unpins it.
- Expanded sidebar pushes layout sideways.
- Main chat stays calm and centered in the remaining space.
- Learning room keeps canvas center and tutor chat right.

Mobile and tablet:

- No hover dependency.
- Thread history becomes a drawer opened by a menu button.
- Main chat is single-column with bottom composer.
- Learning room stacks canvas first, walkthrough strip below it, and tutor chat underneath.

## Accessibility And Clarity

- Sidebar toggle, pin, new chat, archive, send, and stop controls need clear accessible labels.
- Keyboard users must be able to open, pin, and navigate the thread rail.
- Focus states should be visible and consistent with the technical-lab visual style.
- Streaming status should be announced politely without being noisy.
- Stop must be keyboard reachable.
- The proposal CTA should say "Start learning".
- Error states should be plain-language messages, not raw trace panels.

## Out Of Scope

- Persisting sidebar pin state.
- Building a separate user-facing diagnostics panel.
- Reworking artifact generation quality or validation rules beyond streaming needs.
- Changing the core thread persistence model.
- Replacing the technical-lab visual identity with a softer consumer style.

## Success Criteria

- A non-technical user can open the app and immediately understand that they can chat with Parallax.
- The main UI no longer looks like an operations dashboard.
- Thread history remains available without taking over the interface.
- Entering a learning room clearly shifts focus to canvas plus tutor chat.
- Loading and streaming make the app feel responsive immediately after send.
- Existing thread persistence and artifact proposal flow continue to work.
