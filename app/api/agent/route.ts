import { NextResponse } from "next/server";
import { handleAgentRoute, handleAgentRouteStream } from "@/lib/agent/routes";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { stream, ...agentBody } = body as Record<string, unknown>;
    const wantsStream = stream === true || request.headers.get("accept")?.includes("text/event-stream");

    if (wantsStream) {
      return new Response(handleAgentRouteStream(agentBody), {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    const result = await handleAgentRoute(body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown agent error";
    return NextResponse.json({ message, trace: [], artifact: null, commands: [], error: message }, { status: 500 });
  }
}
