import { describe, expect, it, vi } from "vitest";
import type { ArtifactRecord, ChatMessage } from "@/lib/artifacts/artifactTypes";
import { readAwsStorageConfig } from "@/lib/cloud/awsConfig";
import { AwsThreadStore } from "@/lib/cloud/threadStore";

const message: ChatMessage = {
  id: "message-1",
  role: "user",
  content: "Teach me turbines",
  createdAt: "2026-06-09T14:00:00.000Z",
};

const artifact: ArtifactRecord = {
  id: "artifact-1",
  title: "Jet Engine Explorer",
  topic: "jet engines",
  summary: "A guided turbofan room.",
  sceneSource: "const fan = new THREE.Group();",
  html: "<!doctype html><html><body>engine</body></html>",
  components: [
    { id: "fan", label: "Fan" },
    { id: "compressor", label: "Compressor" },
    { id: "turbine", label: "Turbine" },
  ],
  walkthroughSteps: [
    { id: "intro", title: "Intro", narration: "Start at the fan.", targetComponentIds: ["fan"] },
  ],
  createdAt: "2026-06-09T14:01:00.000Z",
};

describe("awsConfig", () => {
  it("reads required AWS storage environment", () => {
    const config = readAwsStorageConfig({
      AWS_REGION: "ap-southeast-1",
      PARALLAX_THREADS_TABLE: "threads-table",
      PARALLAX_ARTIFACT_BUCKET: "artifact-bucket",
    });

    expect(config).toEqual({
      region: "ap-southeast-1",
      tableName: "threads-table",
      bucketName: "artifact-bucket",
    });
  });

  it("throws a clear error when AWS storage env is missing", () => {
    expect(() => readAwsStorageConfig({ AWS_REGION: "ap-southeast-1" })).toThrow("PARALLAX_THREADS_TABLE is required");
  });
});

describe("AwsThreadStore", () => {
  it("creates a thread summary record in DynamoDB", async () => {
    const dynamo = { send: vi.fn().mockResolvedValue({}) };
    const s3 = { send: vi.fn().mockResolvedValue({}) };
    const store = new AwsThreadStore({
      dynamo,
      s3,
      tableName: "threads-table",
      bucketName: "artifact-bucket",
    });

    const thread = await store.createThread({
      userId: "demo-1",
      title: "New learning room",
      now: "2026-06-09T14:00:00.000Z",
      threadId: "thread-1",
    });

    expect(thread).toEqual({
      id: "thread-1",
      title: "New learning room",
      createdAt: "2026-06-09T14:00:00.000Z",
      updatedAt: "2026-06-09T14:00:00.000Z",
    });
    expect(dynamo.send).toHaveBeenCalledTimes(1);
    expect(dynamo.send.mock.calls[0][0].input).toMatchObject({
      TableName: "threads-table",
      Item: {
        PK: "USER#demo-1",
        SK: "THREAD#thread-1",
        entityType: "thread",
        userId: "demo-1",
        threadId: "thread-1",
        title: "New learning room",
      },
    });
  });

  it("persists a message under the thread partition", async () => {
    const dynamo = { send: vi.fn().mockResolvedValue({}) };
    const s3 = { send: vi.fn().mockResolvedValue({}) };
    const store = new AwsThreadStore({ dynamo, s3, tableName: "threads-table", bucketName: "artifact-bucket" });

    await store.appendMessage("thread-1", message);

    expect(dynamo.send.mock.calls[0][0].input).toMatchObject({
      TableName: "threads-table",
      Item: {
        PK: "THREAD#thread-1",
        SK: "MESSAGE#2026-06-09T14:00:00.000Z#message-1",
        entityType: "message",
        content: "Teach me turbines",
      },
    });
  });

  it("stores artifact payloads in S3 and metadata in DynamoDB", async () => {
    const dynamo = { send: vi.fn().mockResolvedValue({}) };
    const s3 = { send: vi.fn().mockResolvedValue({}) };
    const store = new AwsThreadStore({ dynamo, s3, tableName: "threads-table", bucketName: "artifact-bucket" });

    await store.saveArtifact("thread-1", artifact);

    expect(s3.send).toHaveBeenCalledTimes(2);
    expect(s3.send.mock.calls[0][0].input).toMatchObject({
      Bucket: "artifact-bucket",
      Key: "artifacts/thread-1/artifact-1/index.html",
      Body: artifact.html,
      ContentType: "text/html; charset=utf-8",
    });
    expect(s3.send.mock.calls[1][0].input).toMatchObject({
      Bucket: "artifact-bucket",
      Key: "artifacts/thread-1/artifact-1/scene.js",
      Body: artifact.sceneSource,
      ContentType: "text/javascript; charset=utf-8",
    });
    expect(dynamo.send.mock.calls[0][0].input.Item).toMatchObject({
      PK: "THREAD#thread-1",
      SK: "ARTIFACT#artifact-1",
      entityType: "artifact",
      htmlS3Key: "artifacts/thread-1/artifact-1/index.html",
      sceneSourceS3Key: "artifacts/thread-1/artifact-1/scene.js",
    });
  });
});
