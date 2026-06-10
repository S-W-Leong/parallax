# Jet Engine Demo Path Implementation Plan

> Superseded boundary note, 2026-06-10: The current implementation no longer uses a client-side demo artifact injection or local canned tutor. The jet-engine starter prompt routes through the real `/api/agent` Guide. Only the 3D scene is deterministic: `build_learning_artifact` substitutes the fixed jet-engine artifact for guided jet-engine plans, and learning-room chat remains wired to the real Guide plus `send_artifact_command`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic jet-engine live-demo path as the first empty-chat starter prompt while preserving the real Guide Agent workflow for every other prompt.

**Architecture:** The updated app architecture has one user-facing Guide Agent backed by an Agents SDK Session, with Builder and Critic workers hidden behind `build_learning_artifact`. This demo path stays entirely client-side: it injects a local `ArtifactRecord` through existing reducer actions and bypasses `/api/agent` only for tutor turns inside that fixed demo artifact. No Guide Agent, SDK session, DynamoDB, S3, Builder, or Critic code changes are part of this plan.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, existing `LearningSession` reducer, existing artifact runtime via `renderArtifactHtml`, existing iframe `postMessage` command contract.

---

## Scope Check

The approved spec covers one fallback demo path. The updated architecture confirms the correct boundary: the demo should not fake planner, tutor, or artifact-worker routes because those are now unified under the Guide Agent. This plan only touches client state, starter prompt rendering, local demo artifact data, and tests.

## File Structure

- Create `lib/demo/jetEngineDemo.ts`: owns starter prompt metadata, fixed demo artifact, proposal copy, trace copy, demo-artifact guard, and local tutor response helper.
- Modify `components/app/ChatHome.tsx`: render starter prompt objects from the demo module and call a starter-prompt handler for chip clicks while keeping composer submissions on the normal text handler.
- Modify `components/app/ParallaxArtifactApp.tsx`: add the demo starter handler and a demo-only local tutor branch inside the existing `sendGuideMessage` flow.
- Create `tests/jet-engine-demo.test.ts`: validate starter metadata, artifact contract, rendered HTML, and canned tutor command mapping.
- Modify `tests/chat-home.test.tsx`: verify the empty state renders the jet-engine starter prompt first.
- Modify `tests/parallax-app-layout.test.ts`: verify the app shell routes only the fixed demo artifact to the local tutor branch.

## Task 1: Demo Data Module

**Files:**
- Create: `lib/demo/jetEngineDemo.ts`
- Create: `tests/jet-engine-demo.test.ts`

- [ ] **Step 1: Write the failing demo module test**

Create `tests/jet-engine-demo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { artifactRecordSchema } from "@/lib/artifacts/artifactTypes";
import { validateSceneSource } from "@/lib/artifacts/artifactValidator";
import {
  JET_ENGINE_DEMO_ARTIFACT,
  JET_ENGINE_DEMO_ID,
  STARTER_PROMPTS,
  getJetEngineDemoTutorTurn,
  isJetEngineDemoArtifact,
  isJetEngineDemoStarterPrompt,
} from "@/lib/demo/jetEngineDemo";

describe("jet engine demo data", () => {
  it("marks only the first starter prompt as the jet engine demo trigger", () => {
    expect(STARTER_PROMPTS[0]).toMatchObject({
      id: "jet-engine-demo",
      label: "Tour a jet engine",
      demoId: JET_ENGINE_DEMO_ID,
    });
    expect(isJetEngineDemoStarterPrompt(STARTER_PROMPTS[0])).toBe(true);
    expect(STARTER_PROMPTS.slice(1).every((prompt) => !isJetEngineDemoStarterPrompt(prompt))).toBe(true);
    expect(STARTER_PROMPTS.slice(1).map((prompt) => prompt.demoId)).toEqual([undefined, undefined, undefined]);
  });

  it("provides a valid guided walkthrough artifact rendered through the Parallax runtime", () => {
    expect(artifactRecordSchema.safeParse(JET_ENGINE_DEMO_ARTIFACT).success).toBe(true);
    expect(validateSceneSource(JET_ENGINE_DEMO_ARTIFACT.sceneSource)).toEqual({ ok: true });
    expect(JET_ENGINE_DEMO_ARTIFACT.lessonMode).toBe("guided_walkthrough");
    expect(JET_ENGINE_DEMO_ARTIFACT.controls).toBeUndefined();
    expect(JET_ENGINE_DEMO_ARTIFACT.components.map((component) => component.id)).toEqual([
      "fan",
      "compressor",
      "combustor",
      "turbine",
      "nozzle",
      "shaft",
      "airflow",
    ]);
    expect(JET_ENGINE_DEMO_ARTIFACT.walkthroughSteps.map((step) => step.id)).toEqual([
      "overview",
      "fan-inlet",
      "compressor",
      "combustor",
      "turbine",
      "nozzle",
    ]);
    expect(JET_ENGINE_DEMO_ARTIFACT.html).toContain("/three/three.module.min.js");
    expect(JET_ENGINE_DEMO_ARTIFACT.html).toContain("Tour a Turbofan Jet Engine");
  });

  it("identifies only the fixed demo artifact id as local demo content", () => {
    expect(isJetEngineDemoArtifact(JET_ENGINE_DEMO_ARTIFACT)).toBe(true);
    expect(isJetEngineDemoArtifact({ ...JET_ENGINE_DEMO_ARTIFACT, id: "artifact-real-jet-engine" })).toBe(false);
    expect(isJetEngineDemoArtifact(null)).toBe(false);
  });

  it("maps tutor keywords to concise answers and artifact commands", () => {
    expect(getJetEngineDemoTutorTurn("show the combustor")).toMatchObject({
      commands: [
        { type: "focus_component", componentId: "combustor" },
        { type: "go_to_step", stepId: "combustor" },
      ],
    });

    expect(getJetEngineDemoTutorTurn("explode the view")).toMatchObject({
      commands: [{ type: "explode" }],
    });

    expect(getJetEngineDemoTutorTurn("reset camera")).toMatchObject({
      commands: [{ type: "reset_camera" }],
    });

    expect(getJetEngineDemoTutorTurn("walkthrough please")).toMatchObject({
      commands: [{ type: "start_walkthrough" }],
    });

    const fallback = getJetEngineDemoTutorTurn("what is happening overall?");
    expect(fallback.content).toContain("Air enters through the fan");
    expect(fallback.commands).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `npm run test -- tests/jet-engine-demo.test.ts`

Expected: FAIL with a module resolution error for `@/lib/demo/jetEngineDemo`.

- [ ] **Step 3: Implement the demo data module**

Create `lib/demo/jetEngineDemo.ts`:

```ts
import { renderArtifactHtml } from "@/lib/artifacts/artifactTemplate";
import type { ArtifactCommand, ArtifactRecord } from "@/lib/artifacts/artifactTypes";

export const JET_ENGINE_DEMO_ID = "jet-engine-demo";
export const JET_ENGINE_DEMO_ARTIFACT_ID = "demo-jet-engine-turbofan";

export type StarterPrompt = {
  id: string;
  label: string;
  demoId?: typeof JET_ENGINE_DEMO_ID;
};

export type DemoTutorTurn = {
  content: string;
  commands: ArtifactCommand[];
};

export const STARTER_PROMPTS: StarterPrompt[] = [
  { id: JET_ENGINE_DEMO_ID, label: "Tour a jet engine", demoId: JET_ENGINE_DEMO_ID },
  { id: "fusion-reactor", label: "Explain a fusion reactor" },
  { id: "neuron-synapse", label: "Build a neuron synapse" },
  { id: "orbital-resonance", label: "Show orbital resonance" },
];

export const JET_ENGINE_DEMO_TRACE = [
  "Loaded local jet-engine demo artifact",
  "Skipped Guide Agent for live-demo fallback",
  "Rendered fixed guided walkthrough through the artifact runtime",
];

export const JET_ENGINE_DEMO_PROPOSAL_MESSAGE =
  "I loaded a ready-to-run jet engine room for the live demo. Review the proposal, then enter the experience.";

const walkthroughSteps = [
  {
    id: "overview",
    title: "Trace the engine flow",
    narration: "Air moves from the inlet fan through compression, combustion, turbine work, and the exhaust nozzle.",
    targetComponentIds: ["airflow"],
    camera: { position: [5.5, 3.2, 8.2] as [number, number, number], lookAt: [0, 0, 0] as [number, number, number] },
  },
  {
    id: "fan-inlet",
    title: "Fan and inlet",
    narration: "The fan pulls in a large mass of air. Some air bypasses the hot core, while the rest enters the compressor.",
    targetComponentIds: ["fan"],
    camera: { position: [-5.8, 2.2, 4.2] as [number, number, number], lookAt: [-3.8, 0, 0] as [number, number, number] },
  },
  {
    id: "compressor",
    title: "Compressor stages",
    narration: "Alternating compressor stages squeeze incoming air, raising pressure before fuel is added.",
    targetComponentIds: ["compressor"],
    camera: { position: [-3.2, 2.3, 4.4] as [number, number, number], lookAt: [-1.8, 0, 0] as [number, number, number] },
  },
  {
    id: "combustor",
    title: "Combustor",
    narration: "Compressed air mixes with fuel and burns. The gas becomes much hotter and expands toward the turbine.",
    targetComponentIds: ["combustor"],
    camera: { position: [-0.3, 2.5, 4.7] as [number, number, number], lookAt: [0.2, 0, 0] as [number, number, number] },
  },
  {
    id: "turbine",
    title: "Turbine work",
    narration: "Hot gas spins the turbine. That turbine work turns the shaft that helps drive the fan and compressor.",
    targetComponentIds: ["turbine"],
    camera: { position: [2.5, 2.4, 4.5] as [number, number, number], lookAt: [2.1, 0, 0] as [number, number, number] },
  },
  {
    id: "nozzle",
    title: "Nozzle and thrust",
    narration: "The nozzle narrows the flow and accelerates exhaust rearward, producing forward thrust.",
    targetComponentIds: ["nozzle"],
    camera: { position: [5.2, 2.2, 4.2] as [number, number, number], lookAt: [4.2, 0, 0] as [number, number, number] },
  },
];

const components = [
  { id: "fan", label: "Inlet Fan", description: "Draws air into the engine.", metadata: { zone: "cold", role: "air intake" } },
  { id: "compressor", label: "Compressor", description: "Raises air pressure before combustion.", metadata: { zone: "cold", role: "pressure rise" } },
  { id: "combustor", label: "Combustor", description: "Burns fuel with compressed air.", metadata: { zone: "hot", role: "heat addition" } },
  { id: "turbine", label: "Turbine", description: "Extracts work from hot gas.", metadata: { zone: "hot", role: "shaft work" } },
  { id: "nozzle", label: "Exhaust Nozzle", description: "Accelerates exhaust to produce thrust.", metadata: { zone: "hot", role: "thrust" } },
  { id: "shaft", label: "Drive Shaft", description: "Transfers turbine work forward.", metadata: { zone: "mechanical", role: "power transfer" } },
  { id: "airflow", label: "Airflow Path", description: "Shows the core flow from inlet to exhaust.", metadata: { zone: "flow", role: "mass flow" } },
];

const sceneSource = String.raw`
const coldMetal = new THREE.MeshStandardMaterial({ color: 0x8fc7ff, metalness: 0.55, roughness: 0.28 });
const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2d3d4c, metalness: 0.65, roughness: 0.35 });
const hotMetal = new THREE.MeshStandardMaterial({ color: 0xff9f43, metalness: 0.35, roughness: 0.38, emissive: 0x4a1800 });
const flameMaterial = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xff7a00, emissiveIntensity: 0.7, roughness: 0.4 });
const flowMaterial = new THREE.MeshBasicMaterial({ color: 0x62e6d2, transparent: true, opacity: 0.72 });
const shaftMaterial = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.8, roughness: 0.18 });
const shellMaterial = new THREE.MeshStandardMaterial({ color: 0x91a7b7, transparent: true, opacity: 0.16, roughness: 0.25, side: THREE.DoubleSide });

function cylinderAlongX(radiusTop, radiusBottom, length, material, radialSegments) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, length, radialSegments || 48, 1, true), material);
  mesh.rotation.z = Math.PI / 2;
  return mesh;
}

function solidCylinderAlongX(radius, length, material, radialSegments) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, radialSegments || 48), material);
  mesh.rotation.z = Math.PI / 2;
  return mesh;
}

function makeRing(x, radius, tube, color) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, 12, 72),
    new THREE.MeshStandardMaterial({ color, metalness: 0.45, roughness: 0.32 })
  );
  ring.position.x = x;
  ring.rotation.y = Math.PI / 2;
  return ring;
}

const shell = cylinderAlongX(1.38, 0.9, 8.9, shellMaterial, 64);
shell.position.x = 0;
shell.position.y = -0.04;
root.add(shell);

const fanGroup = new THREE.Group();
fanGroup.position.x = -3.85;
const fanRing = makeRing(0, 1.22, 0.045, 0x9bdcff);
fanGroup.add(fanRing);
for (let i = 0; i < 14; i += 1) {
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.08, 0.16), coldMetal);
  blade.position.y = 0.52;
  blade.rotation.x = (Math.PI * 2 * i) / 14;
  blade.rotation.z = -0.24;
  fanGroup.add(blade);
}
root.add(fanGroup);

const compressorGroup = new THREE.Group();
for (let i = 0; i < 5; i += 1) {
  const x = -2.75 + i * 0.38;
  const radius = 1.02 - i * 0.075;
  const stage = makeRing(x, radius, 0.035, 0x7dd3fc);
  compressorGroup.add(stage);
  const stator = solidCylinderAlongX(radius * 0.62, 0.055, darkMetal, 36);
  stator.position.x = x + 0.13;
  compressorGroup.add(stator);
}
root.add(compressorGroup);

const combustorGroup = new THREE.Group();
const combustorCan = cylinderAlongX(0.7, 0.82, 1.25, hotMetal, 48);
combustorCan.position.x = -0.25;
combustorGroup.add(combustorCan);
for (let i = 0; i < 6; i += 1) {
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.55, 24), flameMaterial);
  const angle = (Math.PI * 2 * i) / 6;
  flame.position.set(-0.18, Math.cos(angle) * 0.38, Math.sin(angle) * 0.38);
  flame.rotation.z = -Math.PI / 2;
  combustorGroup.add(flame);
}
root.add(combustorGroup);

const turbineGroup = new THREE.Group();
for (let i = 0; i < 4; i += 1) {
  const x = 1.25 + i * 0.42;
  const radius = 0.82 - i * 0.045;
  const stage = makeRing(x, radius, 0.042, 0xfbbf24);
  turbineGroup.add(stage);
  for (let bladeIndex = 0; bladeIndex < 10; bladeIndex += 1) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.065, radius * 0.8, 0.12), hotMetal);
    blade.position.set(x, Math.cos((Math.PI * 2 * bladeIndex) / 10) * 0.36, Math.sin((Math.PI * 2 * bladeIndex) / 10) * 0.36);
    blade.rotation.x = (Math.PI * 2 * bladeIndex) / 10;
    blade.rotation.z = 0.28;
    turbineGroup.add(blade);
  }
}
root.add(turbineGroup);

const nozzleGroup = new THREE.Group();
const nozzle = cylinderAlongX(0.72, 1.02, 1.25, new THREE.MeshStandardMaterial({ color: 0xffc078, metalness: 0.5, roughness: 0.28 }), 56);
nozzle.position.x = 3.55;
nozzleGroup.add(nozzle);
const exhaustGlow = cylinderAlongX(0.42, 0.68, 1.0, new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.38 }), 48);
exhaustGlow.position.x = 4.2;
nozzleGroup.add(exhaustGlow);
root.add(nozzleGroup);

const shaftGroup = new THREE.Group();
const shaft = solidCylinderAlongX(0.12, 6.0, shaftMaterial, 32);
shaft.position.x = -0.65;
shaftGroup.add(shaft);
root.add(shaftGroup);

const airflowGroup = new THREE.Group();
const coreCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-4.65, 0, 0),
  new THREE.Vector3(-3.2, 0.02, 0),
  new THREE.Vector3(-1.35, 0.02, 0),
  new THREE.Vector3(0.1, 0.02, 0),
  new THREE.Vector3(1.65, 0.02, 0),
  new THREE.Vector3(4.55, 0, 0),
]);
const coreFlow = new THREE.Mesh(new THREE.TubeGeometry(coreCurve, 80, 0.045, 14, false), flowMaterial);
airflowGroup.add(coreFlow);
for (let i = 0; i < 7; i += 1) {
  const marker = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.28, 24), flowMaterial);
  marker.position.x = -4.1 + i * 1.25;
  marker.rotation.z = -Math.PI / 2;
  airflowGroup.add(marker);
}
root.add(airflowGroup);

registerComponent("fan", "Inlet Fan", fanGroup, { zone: "cold", role: "air intake" });
registerComponent("compressor", "Compressor", compressorGroup, { zone: "cold", role: "pressure rise" });
registerComponent("combustor", "Combustor", combustorGroup, { zone: "hot", role: "heat addition" });
registerComponent("turbine", "Turbine", turbineGroup, { zone: "hot", role: "shaft work" });
registerComponent("nozzle", "Exhaust Nozzle", nozzleGroup, { zone: "hot", role: "thrust" });
registerComponent("shaft", "Drive Shaft", shaftGroup, { zone: "mechanical", role: "power transfer" });
registerComponent("airflow", "Airflow Path", airflowGroup, { zone: "flow", role: "mass flow" });

setWalkthroughSteps([
  { id: "overview", title: "Trace the engine flow", narration: "Air moves from the inlet fan through compression, combustion, turbine work, and the exhaust nozzle.", targetComponentIds: ["airflow"], camera: { position: [5.5, 3.2, 8.2], lookAt: [0, 0, 0] } },
  { id: "fan-inlet", title: "Fan and inlet", narration: "The fan pulls in a large mass of air. Some air bypasses the hot core, while the rest enters the compressor.", targetComponentIds: ["fan"], camera: { position: [-5.8, 2.2, 4.2], lookAt: [-3.8, 0, 0] } },
  { id: "compressor", title: "Compressor stages", narration: "Alternating compressor stages squeeze incoming air, raising pressure before fuel is added.", targetComponentIds: ["compressor"], camera: { position: [-3.2, 2.3, 4.4], lookAt: [-1.8, 0, 0] } },
  { id: "combustor", title: "Combustor", narration: "Compressed air mixes with fuel and burns. The gas becomes much hotter and expands toward the turbine.", targetComponentIds: ["combustor"], camera: { position: [-0.3, 2.5, 4.7], lookAt: [0.2, 0, 0] } },
  { id: "turbine", title: "Turbine work", narration: "Hot gas spins the turbine. That turbine work turns the shaft that helps drive the fan and compressor.", targetComponentIds: ["turbine"], camera: { position: [2.5, 2.4, 4.5], lookAt: [2.1, 0, 0] } },
  { id: "nozzle", title: "Nozzle and thrust", narration: "The nozzle narrows the flow and accelerates exhaust rearward, producing forward thrust.", targetComponentIds: ["nozzle"], camera: { position: [5.2, 2.2, 4.2], lookAt: [4.2, 0, 0] } }
]);

setStatus("Jet engine demo ready. Use the walkthrough controls or ask the tutor to focus a component.");
`;

export const JET_ENGINE_DEMO_ARTIFACT: ArtifactRecord = {
  id: JET_ENGINE_DEMO_ARTIFACT_ID,
  title: "Tour a Turbofan Jet Engine",
  topic: "jet engines",
  summary: "A guided cutaway of how air, fuel, heat, shaft work, and exhaust combine to produce thrust.",
  lessonMode: "guided_walkthrough",
  interactionGoal: "Follow the engine from inlet airflow to exhaust thrust while focusing each major stage.",
  sceneSource,
  html: renderArtifactHtml({
    id: JET_ENGINE_DEMO_ARTIFACT_ID,
    topic: "jet engines",
    title: "Tour a Turbofan Jet Engine",
    summary: "A guided cutaway of how air, fuel, heat, shaft work, and exhaust combine to produce thrust.",
    lessonMode: "guided_walkthrough",
    interactionGoal: "Follow the engine from inlet airflow to exhaust thrust while focusing each major stage.",
    sceneSource,
    components,
    walkthroughSteps,
    learningOutcomes: [
      "Trace air from inlet to exhaust",
      "See where pressure, heat, and shaft work change",
      "Connect turbine work to thrust",
    ],
  }),
  components,
  walkthroughSteps,
  learningOutcomes: [
    "Trace air from inlet to exhaust",
    "See where pressure, heat, and shaft work change",
    "Connect turbine work to thrust",
  ],
  createdAt: "2026-06-10T00:00:00.000Z",
};

export function isJetEngineDemoStarterPrompt(prompt: StarterPrompt): boolean {
  return prompt.demoId === JET_ENGINE_DEMO_ID;
}

export function isJetEngineDemoArtifact(artifact: ArtifactRecord | null | undefined): artifact is ArtifactRecord {
  return artifact?.id === JET_ENGINE_DEMO_ARTIFACT_ID;
}

function componentTurn(componentId: string, stepId: string, content: string): DemoTutorTurn {
  return {
    content,
    commands: [
      { type: "focus_component", componentId },
      { type: "go_to_step", stepId },
    ],
  };
}

export function getJetEngineDemoTutorTurn(message: string): DemoTutorTurn {
  const text = message.toLowerCase();

  if (/\bexplode|cutaway|separate|pull apart\b/.test(text)) {
    return {
      content: "I separated the engine stages so the airflow path and shaft relationship are easier to see.",
      commands: [{ type: "explode" }],
    };
  }

  if (/\bcollapse|assemble|together\b/.test(text)) {
    return {
      content: "I collapsed the view back into the normal engine layout so the stages line up front to back.",
      commands: [{ type: "collapse" }],
    };
  }

  if (/\breset|start over|camera\b/.test(text)) {
    return {
      content: "I reset the camera to the full engine view.",
      commands: [{ type: "reset_camera" }],
    };
  }

  if (/\bwalkthrough|airflow|steps|tour\b/.test(text)) {
    return {
      content: "Starting the walkthrough from the airflow overview. Watch the path move from cold intake to hot exhaust.",
      commands: [{ type: "start_walkthrough" }],
    };
  }

  if (/\bfan|inlet|intake\b/.test(text)) {
    return componentTurn(
      "fan",
      "fan-inlet",
      "The inlet fan moves a large mass of air. In a turbofan, much of that air bypasses the hot core and still contributes to thrust.",
    );
  }

  if (/\bcompressor|pressure|squeeze\b/.test(text)) {
    return componentTurn(
      "compressor",
      "compressor",
      "The compressor raises air pressure before combustion. Higher pressure lets the combustor release energy into a denser air stream.",
    );
  }

  if (/\bcombustor|burn|fuel|ignite|combustion\b/.test(text)) {
    return componentTurn(
      "combustor",
      "combustor",
      "The combustor mixes fuel with compressed air and burns it. The big jump here is temperature, not just pressure.",
    );
  }

  if (/\bturbine|shaft|drive\b/.test(text)) {
    return componentTurn(
      "turbine",
      "turbine",
      "The turbine extracts some energy from the hot gas and turns the drive shaft. That shaft work keeps the fan and compressor spinning.",
    );
  }

  if (/\bnozzle|exhaust|thrust|accelerate\b/.test(text)) {
    return componentTurn(
      "nozzle",
      "nozzle",
      "The nozzle turns remaining thermal energy into fast rearward exhaust. Pushing mass backward is what produces forward thrust.",
    );
  }

  return {
    content:
      "Air enters through the fan, gets squeezed by the compressor, burns with fuel in the combustor, spins the turbine, and accelerates through the nozzle to make thrust. Ask me to focus the compressor, combustor, turbine, or nozzle.",
    commands: [],
  };
}
```

- [ ] **Step 4: Run the demo module test to verify it passes**

Run: `npm run test -- tests/jet-engine-demo.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add lib/demo/jetEngineDemo.ts tests/jet-engine-demo.test.ts
git commit -m "feat: add jet engine demo data"
```

## Task 2: Starter Prompt Rendering

**Files:**
- Modify: `components/app/ChatHome.tsx`
- Modify: `tests/chat-home.test.tsx`

- [ ] **Step 1: Write the failing ChatHome starter prompt test**

Add this test to `tests/chat-home.test.tsx`:

```ts
  it("renders the jet engine demo as the first empty-state starter prompt", () => {
    const emptyHtml = renderToStaticMarkup(
      <ChatHome messages={[]} artifacts={{}} trace={[]} busy={false} {...handlers} />,
    );

    expect(emptyHtml).toContain("Tour a jet engine");
    expect(emptyHtml.indexOf("Tour a jet engine")).toBeLessThan(emptyHtml.indexOf("Explain a fusion reactor"));
  });
```

- [ ] **Step 2: Run the ChatHome test to verify it fails**

Run: `npm run test -- tests/chat-home.test.tsx`

Expected: FAIL because `ChatHome` still renders the old string-only starter prompt list.

- [ ] **Step 3: Update ChatHome to use starter prompt objects**

Replace `components/app/ChatHome.tsx` with:

```tsx
"use client";

import type { ArtifactRecord, ChatMessage } from "@/lib/artifacts/artifactTypes";
import { STARTER_PROMPTS, type StarterPrompt } from "@/lib/demo/jetEngineDemo";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatThread } from "@/components/chat/ChatThread";

type ChatHomeProps = {
  messages: ChatMessage[];
  artifacts: Record<string, ArtifactRecord>;
  trace: string[];
  busy: boolean;
  onSendMessage: (message: string) => void;
  onStarterPrompt: (prompt: StarterPrompt) => void;
  onStop: () => void;
  onEnterExperience: (artifactId: string) => void;
};

export function ChatHome({
  messages,
  artifacts,
  trace,
  busy,
  onSendMessage,
  onStarterPrompt,
  onStop,
  onEnterExperience,
}: ChatHomeProps) {
  const hasMessages = messages.length > 0;

  return (
    <section className="chat-home-shell" aria-label="Parallax chat">
      <div className="chat-scroll-region">
        {!hasMessages ? (
          <div className="ambient-field" aria-hidden="true">
            <span className="ambient-ring ambient-ring-a" />
            <span className="ambient-ring ambient-ring-b" />
            <span className="ambient-connector ambient-connector-a" />
            <span className="ambient-connector ambient-connector-b" />
            <span className="ambient-node ambient-node-a" />
            <span className="ambient-node ambient-node-b" />
            <span className="ambient-node ambient-node-c" />
            <span className="ambient-node ambient-node-d" />
            <span className="ambient-node ambient-node-e" />
            <span className="ambient-node ambient-node-f" />
          </div>
        ) : null}
        <ChatThread
          messages={messages}
          artifacts={artifacts}
          trace={trace}
          onEnterExperience={onEnterExperience}
          proposalMode="full"
        />
        {!hasMessages ? (
          <div className="starter-prompts" aria-label="Starter prompts">
            {STARTER_PROMPTS.map((prompt) => (
              <button className="prompt-chip" key={prompt.id} type="button" onClick={() => onStarterPrompt(prompt)} disabled={busy}>
                {prompt.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="chat-composer-region">
        <ChatComposer pending={busy} placeholder="Ask to learn any STEM topic" onStop={onStop} onSubmit={onSendMessage} />
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Update the test handler shape**

In `tests/chat-home.test.tsx`, update the `handlers` object:

```ts
const handlers = {
  onSendMessage: () => undefined,
  onStarterPrompt: () => undefined,
  onStop: () => undefined,
  onEnterExperience: () => undefined,
};
```

- [ ] **Step 5: Run the ChatHome test to verify it passes**

Run: `npm run test -- tests/chat-home.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add components/app/ChatHome.tsx tests/chat-home.test.tsx
git commit -m "feat: render demo starter prompt"
```

## Task 3: App Shell Demo Routing

**Files:**
- Modify: `components/app/ParallaxArtifactApp.tsx`
- Modify: `tests/parallax-app-layout.test.ts`

- [ ] **Step 1: Write the failing local-demo routing test**

Update `tests/parallax-app-layout.test.ts` to import the demo artifact and the new exported guard:

```ts
import { JET_ENGINE_DEMO_ARTIFACT } from "@/lib/demo/jetEngineDemo";
import { getAppShellClassName, shouldUseLocalDemoTutor } from "@/components/app/ParallaxArtifactApp";
```

Add this test:

```ts
  it("uses the local tutor only for the fixed jet engine demo artifact", () => {
    expect(shouldUseLocalDemoTutor(JET_ENGINE_DEMO_ARTIFACT)).toBe(true);
    expect(shouldUseLocalDemoTutor({ ...JET_ENGINE_DEMO_ARTIFACT, id: "artifact-real-jet-engine" })).toBe(false);
    expect(shouldUseLocalDemoTutor(null)).toBe(false);
  });
```

- [ ] **Step 2: Run the app layout test to verify it fails**

Run: `npm run test -- tests/parallax-app-layout.test.ts`

Expected: FAIL because `shouldUseLocalDemoTutor` is not exported.

- [ ] **Step 3: Import demo helpers in the app shell**

In `components/app/ParallaxArtifactApp.tsx`, add this import:

```ts
import {
  JET_ENGINE_DEMO_ARTIFACT,
  JET_ENGINE_DEMO_PROPOSAL_MESSAGE,
  JET_ENGINE_DEMO_TRACE,
  getJetEngineDemoTutorTurn,
  isJetEngineDemoArtifact,
  isJetEngineDemoStarterPrompt,
  type StarterPrompt,
} from "@/lib/demo/jetEngineDemo";
```

- [ ] **Step 4: Export the local-demo tutor guard**

Add this function near `getAppShellClassName`:

```ts
export function shouldUseLocalDemoTutor(artifact: ArtifactRecord | null): artifact is ArtifactRecord {
  return isJetEngineDemoArtifact(artifact);
}
```

- [ ] **Step 5: Add the starter prompt handler**

Inside `ParallaxArtifactApp`, add this function before `sendGuideMessage`:

```ts
  function sendStarterPrompt(prompt: StarterPrompt) {
    if (!activeThreadId) return;

    if (isJetEngineDemoStarterPrompt(prompt)) {
      dispatchToThread(activeThreadId, { type: "user_message", content: prompt.label });
      dispatchToThread(activeThreadId, {
        type: "artifact_created",
        artifact: JET_ENGINE_DEMO_ARTIFACT,
        trace: JET_ENGINE_DEMO_TRACE,
        message: JET_ENGINE_DEMO_PROPOSAL_MESSAGE,
      });
      return;
    }

    void sendGuideMessage(prompt.label);
  }
```

- [ ] **Step 6: Add the local demo tutor branch to `sendGuideMessage`**

In `sendGuideMessage`, add this branch immediately after `const activeSession = getThreadSession(threadId) ?? state;`:

```ts
    if (activeSession.mode === "learning_room" && shouldUseLocalDemoTutor(activeArtifact)) {
      const tutorTurn = getJetEngineDemoTutorTurn(message);
      dispatchToThread(threadId, { type: "user_message", content: message });
      dispatchToThread(threadId, {
        type: "assistant_message",
        content: tutorTurn.content,
        artifactId: activeArtifact.id,
      });
      if (tutorTurn.commands.length) {
        dispatchToThread(threadId, { type: "enqueue_commands", commands: tutorTurn.commands });
      }
      return;
    }
```

This branch must appear before the existing learning-room `/api/agent` call so the fixed demo artifact does not hit the Guide Agent. The existing learning-room branch remains unchanged for all other artifacts.

- [ ] **Step 7: Pass the starter handler to ChatHome**

In the `ChatHome` JSX call, add:

```tsx
        onStarterPrompt={sendStarterPrompt}
```

The final prop block should include both:

```tsx
        onSendMessage={sendGuideMessage}
        onStarterPrompt={sendStarterPrompt}
```

- [ ] **Step 8: Run the app layout test to verify it passes**

Run: `npm run test -- tests/parallax-app-layout.test.ts`

Expected: PASS.

- [ ] **Step 9: Run the focused UI and demo tests together**

Run: `npm run test -- tests/jet-engine-demo.test.ts tests/chat-home.test.tsx tests/parallax-app-layout.test.ts`

Expected: PASS.

- [ ] **Step 10: Commit Task 3**

Run:

```bash
git add components/app/ParallaxArtifactApp.tsx tests/parallax-app-layout.test.ts
git commit -m "feat: route jet engine demo locally"
```

## Task 4: Full Verification

**Files:**
- No file edits.

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`

Expected: PASS with all Vitest test files passing.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: PASS with Next.js completing the production build.

- [ ] **Step 3: Start the dev server for browser verification**

Run: `npm run dev`

Expected: Next.js starts on `http://localhost:3000`. If port 3000 is occupied, use the next available local port reported by Next.js.

- [ ] **Step 4: Verify the demo flow in Browser**

Use the Browser plugin to open the local app and verify this exact flow:

1. Empty chat shows `Tour a jet engine` as the first starter prompt.
2. Clicking `Tour a jet engine` shows a normal proposal card titled `Tour a Turbofan Jet Engine`.
3. Clicking `Start learning` enters the learning room.
4. The iframe renders a nonblank jet-engine cutaway.
5. Sending `show the combustor` in the room chat adds a local assistant response and focuses the combustor.
6. Sending `explode the view` separates the engine stages.
7. Starting a new chat and clicking any non-demo starter prompt uses the normal Guide Agent streaming path.

Expected: all seven checks pass. The non-demo starter may require `OPENAI_API_KEY`; if the key is unavailable, verify that it attempts `/api/agent` and reports the existing key error rather than loading the demo artifact.

- [ ] **Step 5: Stop the dev server**

Stop the `npm run dev` process after browser verification finishes.

- [ ] **Step 6: Commit verification-only updates if none were needed**

No commit is needed for Task 4 when it changes no files. If browser verification exposes a defect, fix it with a failing test first, rerun Task 4 from Step 1, and commit the focused fix.

## Final Checklist

- [ ] `STARTER_PROMPTS[0]` is the only prompt with `demoId: "jet-engine-demo"`.
- [ ] Composer submissions never use the demo trigger.
- [ ] The demo starter uses `user_message` plus `artifact_created` and shows the proposal card first.
- [ ] The fixed demo artifact uses `guided_walkthrough`, has no controls, and passes `validateSceneSource`.
- [ ] Demo room chat uses local tutor turns only when `activeArtifact.id === "demo-jet-engine-turbofan"`.
- [ ] Non-demo chat and non-demo learning-room messages still call the single `/api/agent` Guide Agent endpoint.
- [ ] No agent route, Builder, Critic, SDK session, DynamoDB, or S3 code is changed by this feature.
- [ ] `npm run test` passes.
- [ ] `npm run build` passes.
- [ ] Browser verification confirms the local demo path renders and responds.
