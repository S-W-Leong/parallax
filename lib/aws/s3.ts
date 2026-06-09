import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import cachedLesson from "@/data/cached-jet-engine-lesson.json";
import { parseLesson, type Lesson } from "@/lib/engine/lessonTypes";

function getClient() {
  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, PARALLAX_S3_BUCKET } = process.env;
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;
  if (!region || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !PARALLAX_S3_BUCKET) {
    throw new Error("AWS cache environment variables are not configured");
  }

  return {
    bucket: PARALLAX_S3_BUCKET,
    client: new S3Client({
      region,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
    }),
  };
}

async function streamToString(body: AsyncIterable<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

export async function getCachedLessonFromS3(key: "jet_engine"): Promise<{ lesson: Lesson; cacheStatus: string }> {
  try {
    const { bucket, client } = getClient();
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: `lessons/${key}.json` }));
    if (!response.Body) throw new Error("S3 object has no body");
    const text = await streamToString(response.Body as AsyncIterable<Uint8Array>);
    return { lesson: { ...parseLesson(JSON.parse(text)), cacheStatus: "s3_cache" }, cacheStatus: "s3_cache" };
  } catch {
    return { lesson: parseLesson(cachedLesson), cacheStatus: "local_fallback" };
  }
}

export async function putLessonToS3(key: "jet_engine", lesson: Lesson) {
  const { bucket, client } = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `lessons/${key}.json`,
      Body: JSON.stringify(lesson, null, 2),
      ContentType: "application/json",
    }),
  );
}
