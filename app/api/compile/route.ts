import { NextResponse } from "next/server";
import { compileFallbackTrace, compileJetEngineLesson } from "@/lib/agent/compiler";

export async function POST() {
  try {
    const result = await compileJetEngineLesson();
    return NextResponse.json(result);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "compile failed";
    return NextResponse.json(compileFallbackTrace(reason));
  }
}
