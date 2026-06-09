import type { ComponentId } from "./lessonTypes";

export type Vec3 = readonly [number, number, number];

export const engineParts: Record<ComponentId, { label: string; position: Vec3; explode: Vec3; color: string }> = {
  fan: { label: "Fan", position: [-4, 0, 0], explode: [-0.9, 1.0, 0], color: "#54d7ff" },
  compressor: { label: "Compressor", position: [-2, 0, 0], explode: [-0.3, 1.15, 0], color: "#41d6b7" },
  combustor: { label: "Combustor", position: [0, 0, 0], explode: [0, 1.2, 0], color: "#f6b74b" },
  turbine: { label: "Turbine", position: [2, 0, 0], explode: [0.3, 1.15, 0], color: "#ff8a4d" },
  shaft: { label: "Shaft", position: [0, 0, 0], explode: [0, -0.85, 0], color: "#d9e5e7" },
  nozzle: { label: "Nozzle", position: [4, 0, 0], explode: [0.9, 1.0, 0], color: "#b390ff" },
  casing: { label: "Cutaway casing", position: [0, 0, 0], explode: [0, -1.2, 0], color: "#78909c" },
};

export const cameraPresetsConfig = {
  wide_cutaway: { position: [0, 3.1, 8.3] as Vec3, target: [0, 0.15, 0] as Vec3 },
  compressor_focus: { position: [-2.15, 2.0, 5.2] as Vec3, target: [-2, 0.25, 0] as Vec3 },
  turbine_shaft_focus: { position: [1.15, 2.05, 5.2] as Vec3, target: [0.85, 0, 0] as Vec3 },
  exhaust_focus: { position: [3.65, 1.8, 4.7] as Vec3, target: [3.55, 0.1, 0] as Vec3 },
};

export const engineOrder: ComponentId[] = ["fan", "compressor", "combustor", "turbine", "shaft", "nozzle", "casing"];
