import { NextResponse } from "next/server";
import { z } from "zod";
import { getThreadStore } from "@/lib/cloud/threadStore";

const createThreadSchema = z.object({
  userId: z.string().min(1),
  title: z.string().min(1).default("New chat"),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
  const threads = await getThreadStore().listThreads(userId);
  return NextResponse.json({ threads });
}

export async function POST(request: Request) {
  const body = createThreadSchema.parse(await request.json());
  const now = new Date().toISOString();
  const thread = await getThreadStore().createThread({
    userId: body.userId,
    title: body.title,
    now,
    threadId: crypto.randomUUID(),
  });
  return NextResponse.json({ thread });
}
