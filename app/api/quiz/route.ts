import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();
  const correct = body.answerIndex === body.correctAnswerIndex;

  if (correct) {
    return NextResponse.json({ correct: true, diagnosis: "Correct. The shaft connects turbine work back to the compressor." });
  }

  return NextResponse.json({
    correct: false,
    diagnosis: "You missed that the turbine drives the compressor through the central shaft.",
    command: {
      type: "startReteach",
      focusComponents: ["compressor", "shaft", "turbine"],
      animation: "turbine_shaft_compressor_replay",
    },
    narration: "Watch the shaft. Hot gas spins the turbine, the turbine turns the shaft, and the shaft drives the compressor.",
  });
}
