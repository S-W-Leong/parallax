import { NextResponse } from "next/server";
import { handleAgentRoute } from "@/lib/agent/routes";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await handleAgentRoute(body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown agent error";
    return NextResponse.json({ message, trace: [], artifact: null, commands: [], error: message }, { status: 500 });
  }
}
