import { NextResponse } from "next/server";
import { getThreadStore } from "@/lib/cloud/threadStore";
import { createSessionFromThread } from "@/lib/threads/threadSession";

type RouteContext = {
  params: Promise<{ threadId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { threadId } = await context.params;
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
  const loaded = await getThreadStore().loadThread(userId, threadId);
  return NextResponse.json({ session: createSessionFromThread(loaded) });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { threadId } = await context.params;
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
  await getThreadStore().archiveThread(userId, threadId, new Date().toISOString());
  return NextResponse.json({ ok: true });
}
