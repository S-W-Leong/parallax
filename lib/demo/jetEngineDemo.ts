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
  { id: "jet-engine-demo", label: "Tour a jet engine", demoId: JET_ENGINE_DEMO_ID },
  { id: "fusion-reactor", label: "Explain a fusion reactor" },
  { id: "neuron-synapse", label: "Build a neuron synapse" },
  { id: "orbital-resonance", label: "Show orbital resonance" },
];

export const JET_ENGINE_DEMO_TRACE = [
  "Guide selected the built-in jet engine demo.",
  "Builder produced a sealed guided walkthrough artifact.",
  "Guide is ready to focus parts, start the walkthrough, or reset the camera.",
];

export const JET_ENGINE_DEMO_PROPOSAL_MESSAGE =
  "I can load a guided 3D tour of a turbofan jet engine and walk you from inlet airflow to exhaust thrust.";

const components = [
  { id: "fan", label: "Fan", description: "Draws incoming air into the engine." },
  { id: "compressor", label: "Compressor", description: "Raises air pressure before combustion." },
  { id: "combustor", label: "Combustor", description: "Mixes compressed air with fuel and releases heat." },
  { id: "turbine", label: "Turbine", description: "Extracts energy to drive the shaft and compressor." },
  { id: "nozzle", label: "Nozzle", description: "Accelerates exhaust to create thrust." },
  { id: "shaft", label: "Shaft", description: "Carries turbine power forward to the fan and compressor." },
  { id: "airflow", label: "Airflow", description: "Shows the path from inlet air to hot exhaust." },
];

const walkthroughSteps = [
  {
    id: "overview",
    title: "Whole engine flow",
    narration: "Air enters through the fan, is compressed, heated, expanded through the turbine, and accelerated out the nozzle.",
    targetComponentIds: ["airflow", "fan", "nozzle"],
    camera: { position: [8, 4, 9] as [number, number, number], lookAt: [0, 0, 0] as [number, number, number] },
  },
  {
    id: "fan-inlet",
    title: "Fan and inlet",
    narration: "The fan pulls a large mass of air into the engine and sends part of it around the hot core as bypass flow.",
    targetComponentIds: ["fan"],
    camera: { position: [-6, 2, 5] as [number, number, number], lookAt: [-3, 0, 0] as [number, number, number] },
  },
  {
    id: "compressor",
    title: "Compressor",
    narration: "Compressor stages squeeze incoming air into a smaller volume so combustion can release more useful energy.",
    targetComponentIds: ["compressor"],
    camera: { position: [-2, 2.5, 5] as [number, number, number], lookAt: [-1, 0, 0] as [number, number, number] },
  },
  {
    id: "combustor",
    title: "Combustor",
    narration: "Fuel burns with the compressed air in the combustor, sharply raising the gas temperature and pressure.",
    targetComponentIds: ["combustor"],
    camera: { position: [1.5, 2.5, 5] as [number, number, number], lookAt: [1.2, 0, 0] as [number, number, number] },
  },
  {
    id: "turbine",
    title: "Turbine",
    narration: "Hot gas spins the turbine, which turns the shaft and keeps the fan and compressor rotating.",
    targetComponentIds: ["turbine", "shaft"],
    camera: { position: [4, 2.5, 5] as [number, number, number], lookAt: [3.2, 0, 0] as [number, number, number] },
  },
  {
    id: "nozzle",
    title: "Nozzle",
    narration: "The nozzle narrows the exit path so exhaust speeds up and produces forward thrust.",
    targetComponentIds: ["nozzle", "airflow"],
    camera: { position: [6.5, 2, 4.5] as [number, number, number], lookAt: [4.8, 0, 0] as [number, number, number] },
  },
];

const sceneSource = `
const materials = {
  casing: new THREE.MeshStandardMaterial({ color: 0x738092, metalness: 0.42, roughness: 0.34, transparent: true, opacity: 0.2, side: THREE.DoubleSide }),
  cutawayPanel: new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.52, roughness: 0.23, side: THREE.DoubleSide }),
  cutawayRib: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.55, roughness: 0.2 }),
  darkCore: new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.32, roughness: 0.45, transparent: true, opacity: 0.18, side: THREE.DoubleSide }),
  fan: new THREE.MeshStandardMaterial({ color: 0xc7f9ff, metalness: 0.65, roughness: 0.17 }),
  fanDark: new THREE.MeshStandardMaterial({ color: 0x263241, metalness: 0.58, roughness: 0.2 }),
  compressor: new THREE.MeshStandardMaterial({ color: 0x5eb9ff, metalness: 0.48, roughness: 0.21, emissive: 0x05345c, emissiveIntensity: 0.14 }),
  compressorGlow: new THREE.MeshBasicMaterial({ color: 0x33b8ff, transparent: true, opacity: 0.23, side: THREE.DoubleSide }),
  combustor: new THREE.MeshStandardMaterial({ color: 0xd66a24, emissive: 0x7c2d12, emissiveIntensity: 0.45, metalness: 0.26, roughness: 0.32 }),
  combustorGlow: new THREE.MeshBasicMaterial({ color: 0xff8a1c, transparent: true, opacity: 0.43, side: THREE.DoubleSide }),
  turbine: new THREE.MeshStandardMaterial({ color: 0xd8b72c, metalness: 0.55, roughness: 0.2, emissive: 0x3d2600, emissiveIntensity: 0.12 }),
  turbineDark: new THREE.MeshStandardMaterial({ color: 0x33280f, metalness: 0.45, roughness: 0.28 }),
  nozzle: new THREE.MeshStandardMaterial({ color: 0xb8c0c7, metalness: 0.72, roughness: 0.18 }),
  shaft: new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.74, roughness: 0.16 }),
  airflow: new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.42 }),
  exhaustPlume: new THREE.MeshBasicMaterial({ color: 0xffa11a, transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
};

const engine = new THREE.Group();
root.add(engine);

function axialCylinder(radiusA, radiusB, length, material, radialSegments) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusA, radiusB, length, radialSegments, 1, true), material);
  mesh.rotation.z = Math.PI / 2;
  return mesh;
}

function solidAxialCylinder(radiusA, radiusB, length, material, radialSegments) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusA, radiusB, length, radialSegments), material);
  mesh.rotation.z = Math.PI / 2;
  return mesh;
}

function latheBody(profile, material, radialSegments) {
  const minX = profile.reduce(function findMinX(current, point) {
    return Math.min(current, point.x);
  }, profile[0].x);
  const maxX = profile.reduce(function findMaxX(current, point) {
    return Math.max(current, point.x);
  }, profile[0].x);
  const centerX = (minX + maxX) / 2;
  const points = profile.map(function makeProfilePoint(point) {
    return new THREE.Vector2(point.radius, point.x - centerX);
  });
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(points, radialSegments), material);
  mesh.rotation.z = Math.PI / 2;
  mesh.position.x = centerX;
  return mesh;
}

function translatedBladeGeometry(thickness, radialLength, chord) {
  const geometry = new THREE.BoxGeometry(thickness, radialLength, chord);
  geometry.translate(0, radialLength / 2, 0);
  return geometry;
}

function addBladeRow(parent, x, count, radius, bladeLength, bladeChord, material, twist, namePrefix) {
  const row = new THREE.Group();
  const geometry = translatedBladeGeometry(0.055, bladeLength, bladeChord);
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const blade = new THREE.Mesh(geometry, material);
    blade.name = namePrefix + i;
    blade.position.set(x, 0, 0);
    blade.scale.y = radius / Math.max(bladeLength, 0.01);
    blade.rotation.x = angle;
    blade.rotation.y = twist;
    blade.rotation.z = 0.16;
    row.add(blade);
  }
  parent.add(row);
  return row;
}

const nacelleProfile = [
  { x: -4.25, radius: 1.28 },
  { x: -4.08, radius: 1.48 },
  { x: -3.55, radius: 1.62 },
  { x: -2.1, radius: 1.58 },
  { x: -0.35, radius: 1.48 },
  { x: 1.55, radius: 1.28 },
  { x: 3.25, radius: 1.04 },
  { x: 4.1, radius: 0.86 },
];
const casing = latheBody(nacelleProfile, materials.casing, 80);
engine.add(casing);

const inletLip = latheBody([
  { x: -4.34, radius: 1.26 },
  { x: -4.2, radius: 1.52 },
  { x: -3.96, radius: 1.58 },
  { x: -3.78, radius: 1.36 },
], materials.cutawayPanel, 80);
engine.add(inletLip);

const coreSkin = axialCylinder(0.98, 0.58, 6.35, materials.darkCore, 64);
coreSkin.position.x = -0.25;
engine.add(coreSkin);

for (let i = 0; i < 8; i += 1) {
  const ribRadius = Math.max(0.78, 1.42 - i * 0.06);
  const cutawayRib = new THREE.Mesh(new THREE.TorusGeometry(ribRadius, 0.015, 8, 72), materials.cutawayRib);
  cutawayRib.position.x = -3.55 + i * 0.78;
  cutawayRib.rotation.y = Math.PI / 2;
  cutawayRib.scale.set(1, 0.74, 1);
  engine.add(cutawayRib);
}

const fan = new THREE.Group();
fan.position.x = -3.55;
const fanHub = solidAxialCylinder(0.34, 0.34, 0.42, materials.fanDark, 48);
fan.add(fanHub);
const spinnerCone = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.92, 48), materials.nozzle);
spinnerCone.position.x = -0.55;
spinnerCone.rotation.z = Math.PI / 2;
fan.add(spinnerCone);
const fanRotor = new THREE.Group();
fan.add(fanRotor);
const frontFanBladeCount = 24;
const fanBladeGeometry = translatedBladeGeometry(0.065, 1.15, 0.2);
for (let i = 0; i < frontFanBladeCount; i += 1) {
  const angle = (i / frontFanBladeCount) * Math.PI * 2;
  const blade = new THREE.Mesh(fanBladeGeometry, materials.fan);
  blade.position.set(-0.02, 0, 0);
  blade.rotation.x = angle;
  blade.rotation.y = 0.48;
  blade.rotation.z = 0.25;
  fanRotor.add(blade);
}
const fanShroud = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.045, 10, 72), materials.cutawayRib);
fanShroud.rotation.y = Math.PI / 2;
fan.add(fanShroud);
engine.add(fan);

const compressor = new THREE.Group();
compressor.position.x = -1.55;
for (let i = 0; i < 7; i += 1) {
  const stageRadius = 0.88 - i * 0.045;
  const stage = solidAxialCylinder(stageRadius * 0.82, stageRadius * 0.9, 0.18, materials.compressor, 48);
  stage.position.x = i * 0.29 - 0.82;
  compressor.add(stage);
  addBladeRow(compressor, stage.position.x + 0.08, 18, stageRadius * 0.58, stageRadius * 0.52, 0.09, materials.compressor, 0.62 - i * 0.04, "compressorBladeRow");
  if (i % 2 === 0) {
    const statorVane = addBladeRow(compressor, stage.position.x + 0.2, 14, stageRadius * 0.74, stageRadius * 0.34, 0.055, materials.cutawayRib, -0.42, "statorVane");
    statorVane.rotation.x = Math.PI / 18;
  }
  const glow = axialCylinder(stageRadius * 0.8, stageRadius * 0.74, 0.06, materials.compressorGlow, 48);
  glow.position.x = stage.position.x - 0.06;
  compressor.add(glow);
}
engine.add(compressor);

const combustor = new THREE.Group();
combustor.position.x = 1.1;
const combustorShell = solidAxialCylinder(0.72, 0.92, 1.34, materials.combustor, 48);
combustor.add(combustorShell);
const combustorGlow = axialCylinder(0.52, 0.7, 1.08, materials.combustorGlow, 48);
combustorGlow.position.x = 0.06;
combustor.add(combustorGlow);
for (let i = 0; i < 10; i += 1) {
  const angle = (i / 10) * Math.PI * 2;
  const fuelInjector = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 12), materials.cutawayRib);
  fuelInjector.position.set(-0.42, Math.sin(angle) * 0.9, Math.cos(angle) * 0.9);
  fuelInjector.rotation.x = Math.PI / 2 + angle;
  fuelInjector.rotation.z = Math.PI / 2;
  combustor.add(fuelInjector);
}
engine.add(combustor);

const turbine = new THREE.Group();
turbine.position.x = 2.82;
for (let i = 0; i < 4; i += 1) {
  const stageRadius = 0.8 - i * 0.055;
  const disk = solidAxialCylinder(stageRadius * 0.72, stageRadius * 0.82, 0.2, i % 2 === 0 ? materials.turbine : materials.turbineDark, 48);
  disk.position.x = i * 0.34 - 0.48;
  turbine.add(disk);
  addBladeRow(turbine, disk.position.x + 0.08, 22, stageRadius * 0.58, stageRadius * 0.46, 0.1, materials.turbine, -0.58 + i * 0.04, "turbineBlade");
}
engine.add(turbine);

const nozzleProfile = [
  { x: 3.38, radius: 0.82 },
  { x: 3.72, radius: 0.7 },
  { x: 4.22, radius: 0.55 },
  { x: 4.7, radius: 0.44 },
];
const nozzle = latheBody(nozzleProfile, materials.nozzle, 64);
engine.add(nozzle);

const exhaustPlume = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.8, 48, 1, true), materials.exhaustPlume);
exhaustPlume.position.x = 5.48;
exhaustPlume.rotation.z = -Math.PI / 2;
engine.add(exhaustPlume);

const shaft = solidAxialCylinder(0.08, 0.08, 6.5, materials.shaft, 24);
shaft.position.x = -0.15;
engine.add(shaft);

const airflow = new THREE.Group();
const airParticleCount = 120;
const airParticlePositions = new Float32Array(airParticleCount * 3);
const airParticleSeeds = [];
function setAirParticle(index, progress, radiusScale) {
  const x = -4.15 + progress * 8.15;
  const hotZone = Math.max(0, Math.min(1, (x - 0.4) / 3.6));
  const radius = (0.68 - progress * 0.22) * radiusScale;
  const angle = airParticleSeeds[index].angle + progress * 5.4;
  airParticlePositions[index * 3] = x;
  airParticlePositions[index * 3 + 1] = Math.sin(angle) * radius;
  airParticlePositions[index * 3 + 2] = Math.cos(angle) * radius * (0.72 + hotZone * 0.28);
}
for (let i = 0; i < airParticleCount; i += 1) {
  const seed = {
    offset: i / airParticleCount,
    speed: 0.0018 + (i % 7) * 0.00022,
    angle: i * 2.399,
    radiusScale: 0.38 + (i % 5) * 0.13,
  };
  airParticleSeeds.push(seed);
  setAirParticle(i, seed.offset, seed.radiusScale);
}
const airflowGeometry = new THREE.BufferGeometry();
airflowGeometry.setAttribute("position", new THREE.BufferAttribute(airParticlePositions, 3));
const airflowParticles = new THREE.Points(
  airflowGeometry,
  new THREE.PointsMaterial({ color: 0x69e6ff, size: 0.075, transparent: true, opacity: 0.9, sizeAttenuation: true })
);
airflow.add(airflowParticles);
airflowParticles.onBeforeRender = function animateAirParticles() {
  for (let i = 0; i < airParticleSeeds.length; i += 1) {
    const seed = airParticleSeeds[i];
    seed.offset = (seed.offset + seed.speed) % 1;
    setAirParticle(i, seed.offset, seed.radiusScale);
  }
  airflowGeometry.attributes.position.needsUpdate = true;
};
engine.add(airflow);

const light = new THREE.PointLight(0xffffff, 1.7, 18);
light.position.set(-3, 4, 5);
scene.add(light);
const hotSectionLight = new THREE.PointLight(0xff8a1c, 1.1, 5);
hotSectionLight.position.set(1.6, 0.7, 1.2);
scene.add(hotSectionLight);
fanRotor.onBeforeRender = function spinFan() {
  fanRotor.rotation.x += 0.035;
};
camera.position.set(8, 4, 9);
camera.lookAt(0, 0, 0);
controls.target.set(0, 0, 0);

registerComponent("fan", "Fan", fan, { section: "inlet" });
registerComponent("compressor", "Compressor", compressor, { section: "core" });
registerComponent("combustor", "Combustor", combustor, { section: "core" });
registerComponent("turbine", "Turbine", turbine, { section: "core" });
registerComponent("nozzle", "Nozzle", nozzle, { section: "exhaust" });
registerComponent("shaft", "Shaft", shaft, { section: "power transfer" });
registerComponent("airflow", "Airflow", airflow, { section: "flow path", labelOffset: [0, -0.45, 0] });
setWalkthroughSteps(${JSON.stringify(walkthroughSteps)});
setStatus("Tour a Turbofan Jet Engine is ready.");
`;

const artifactBase = {
  id: JET_ENGINE_DEMO_ARTIFACT_ID,
  title: "Tour a Turbofan Jet Engine",
  topic: "jet engines",
  summary: "Trace how a turbofan turns inlet airflow, fuel, and rotating machinery into thrust.",
  lessonMode: "guided_walkthrough" as const,
  interactionGoal: "Follow the airflow path and inspect the major rotating and hot-section components.",
  sceneSource,
  components,
  walkthroughSteps,
  learningOutcomes: [
    "Trace airflow through a turbofan engine",
    "Connect compressor, combustor, and turbine roles",
    "Explain how exhaust acceleration creates thrust",
  ],
};

export const JET_ENGINE_DEMO_ARTIFACT: ArtifactRecord = {
  ...artifactBase,
  html: renderArtifactHtml(artifactBase),
  createdAt: "2026-06-10T00:00:00.000Z",
};

export function isJetEngineDemoStarterPrompt(prompt: StarterPrompt): boolean {
  return prompt.demoId === JET_ENGINE_DEMO_ID;
}

export function isJetEngineDemoArtifact(artifact: ArtifactRecord | null): boolean {
  return artifact?.id === JET_ENGINE_DEMO_ARTIFACT_ID;
}

export function getJetEngineDemoTutorTurn(message: string): DemoTutorTurn {
  const normalized = message.toLowerCase();

  if (normalized.includes("combustor")) {
    return {
      content: "Here is the combustor, where compressed air mixes with fuel and releases heat before the turbine.",
      commands: [
        { type: "focus_component", componentId: "combustor" },
        { type: "go_to_step", stepId: "combustor" },
      ],
    };
  }

  if (normalized.includes("explode")) {
    return {
      content: "Exploding the view separates the engine sections so the flow path and shaft relationship are easier to see.",
      commands: [{ type: "explode" }],
    };
  }

  if (normalized.includes("reset") && normalized.includes("camera")) {
    return {
      content: "Resetting the camera to the full-engine view.",
      commands: [{ type: "reset_camera" }],
    };
  }

  if (normalized.includes("walkthrough")) {
    return {
      content: "Starting the guided walkthrough from the overview.",
      commands: [{ type: "start_walkthrough" }],
    };
  }

  return {
    content:
      "Air enters through the fan, gets squeezed in the compressor, heats rapidly in the combustor, spins the turbine, and exits through the nozzle as thrust.",
    commands: [],
  };
}
