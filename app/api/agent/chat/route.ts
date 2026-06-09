import { NextResponse } from "next/server";
import { handleChatRoute } from "@/lib/agent/routes";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await handleChatRoute(body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown chat agent error";
    return NextResponse.json({ message, trace: [], artifact: null, error: message }, { status: 500 });
  }
}
