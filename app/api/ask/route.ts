import { NextResponse } from "next/server";
import { componentIds, type ComponentId } from "@/lib/engine/lessonTypes";

const componentAnswers: Record<ComponentId, string> = {
  fan: "The fan matters because it starts the mass flow. It pulls air into the core and also moves bypass air that contributes much of the thrust in a turbofan.",
  compressor:
    "The compressor raises air pressure before combustion, which lets the engine release much more useful energy from the fuel-air mixture.",
  combustor: "The combustor adds heat energy. Fuel burns in compressed air, creating hot expanding gas that can do work on the turbine.",
  turbine:
    "The turbine extracts work from hot gas. That work spins the central shaft, which keeps the compressor turning upstream.",
  shaft:
    "The shaft is the mechanical link in the feedback loop: turbine work travels through it to drive the compressor.",
  nozzle: "The nozzle turns remaining thermal and pressure energy into fast exhaust, pushing air backward to create forward thrust.",
  casing: "The casing holds the flow path together while the cutaway reveals how air moves through the core stages.",
};

export async function POST(request: Request) {
  const body = await request.json();
  const selected = componentIds.includes(body.selectedComponentId) ? (body.selectedComponentId as ComponentId) : null;
  const answer = selected
    ? componentAnswers[selected]
    : "Select a component and I can answer from that part's role in the jet-engine mechanism.";

  return NextResponse.json({
    answer,
    suggestedCommand: selected ? { type: "focusComponents", componentIds: [selected] } : undefined,
  });
}
