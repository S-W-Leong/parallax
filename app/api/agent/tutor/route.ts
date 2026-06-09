import { NextResponse } from "next/server";
import { handleTutorRoute } from "@/lib/agent/routes";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await handleTutorRoute(body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown tutor agent error";
    return NextResponse.json({ message, commands: [] }, { status: 500 });
  }
}
