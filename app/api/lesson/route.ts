import { NextResponse } from "next/server";
import { getCachedLessonFromS3 } from "@/lib/aws/s3";

export async function GET() {
  const { lesson, cacheStatus } = await getCachedLessonFromS3("jet_engine");
  return NextResponse.json({
    lesson,
    trace: [{ stage: "cache", message: cacheStatus === "s3_cache" ? "Using S3 cached lesson" : "Using local cached fallback" }],
  });
}
