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

  it("lists non-archived thread summaries sorted by newest update first", async () => {
    const dynamo = {
      send: vi.fn().mockResolvedValue({
        Items: [
          {
            PK: "USER#demo-1",
            SK: "THREAD#thread-older",
            entityType: "thread",
            userId: "demo-1",
            threadId: "thread-older",
            title: "Older cells chat",
            createdAt: "2026-06-09T13:00:00.000Z",
            updatedAt: "2026-06-09T13:30:00.000Z",
          },
          {
            PK: "USER#demo-1",
            SK: "THREAD#thread-newer",
            entityType: "thread",
            userId: "demo-1",
            threadId: "thread-newer",
            title: "Newer cells chat",
            createdAt: "2026-06-09T14:00:00.000Z",
            updatedAt: "2026-06-09T14:30:00.000Z",
          },
        ],
      }),
    };
    const s3 = { send: vi.fn().mockResolvedValue({}) };
    const store = new AwsThreadStore({ dynamo, s3, tableName: "threads-table", bucketName: "artifact-bucket" });

    const threads = await store.listThreads("demo-1");

    expect(dynamo.send.mock.calls[0][0].input).toMatchObject({
      TableName: "threads-table",
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :threadPrefix)",
      FilterExpression: "attribute_not_exists(archivedAt)",
      ExpressionAttributeValues: {
        ":pk": "USER#demo-1",
        ":threadPrefix": "THREAD#",
      },
    });
    expect(threads).toEqual([
      {
        id: "thread-newer",
        title: "Newer cells chat",
        createdAt: "2026-06-09T14:00:00.000Z",
        updatedAt: "2026-06-09T14:30:00.000Z",
      },
      {
        id: "thread-older",
        title: "Older cells chat",
        createdAt: "2026-06-09T13:00:00.000Z",
        updatedAt: "2026-06-09T13:30:00.000Z",
      },
    ]);
  });

  it("loads messages and hydrates artifact payloads for a thread", async () => {
    const dynamo = {
      send: vi.fn().mockResolvedValue({
        Items: [
          {
            PK: "THREAD#thread-1",
            SK: "MESSAGE#2026-06-09T14:02:00.000Z#message-2",
            entityType: "message",
            threadId: "thread-1",
            id: "message-2",
            role: "assistant",
            content: "Here is the cell model.",
            createdAt: "2026-06-09T14:02:00.000Z",
            artifactId: "artifact-1",
          },
          {
            PK: "THREAD#thread-1",
            SK: "ARTIFACT#artifact-1",
            entityType: "artifact",
            threadId: "thread-1",
            artifactId: "artifact-1",
            title: "Cell Explorer",
            topic: "cells",
            summary: "A guided cell room.",
            htmlS3Key: "artifacts/thread-1/artifact-1/index.html",
            sceneSourceS3Key: "artifacts/thread-1/artifact-1/scene.js",
            components: [{ id: "nucleus", label: "Nucleus" }],
            walkthroughSteps: [{ id: "intro", title: "Intro", narration: "Start at the nucleus.", targetComponentIds: ["nucleus"] }],
            createdAt: "2026-06-09T14:01:00.000Z",
          },
          {
            PK: "THREAD#thread-1",
            SK: "MESSAGE#2026-06-09T14:00:00.000Z#message-1",
            entityType: "message",
            threadId: "thread-1",
            id: "message-1",
            role: "user",
            content: "Teach me cells",
            createdAt: "2026-06-09T14:00:00.000Z",
          },
        ],
      }),
    };
    const s3 = {
      send: vi
        .fn()
        .mockResolvedValueOnce({ Body: { transformToString: vi.fn().mockResolvedValue("<!doctype html><html><body>cell</body></html>") } })
        .mockResolvedValueOnce({ Body: { transformToString: vi.fn().mockResolvedValue("const nucleus = {};") } }),
    };
    const store = new AwsThreadStore({ dynamo, s3, tableName: "threads-table", bucketName: "artifact-bucket" });

    const loaded = await store.loadThread("thread-1");

    expect(dynamo.send.mock.calls[0][0].input).toMatchObject({
      TableName: "threads-table",
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: {
        ":pk": "THREAD#thread-1",
      },
    });
    expect(s3.send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        input: {
          Bucket: "artifact-bucket",
          Key: "artifacts/thread-1/artifact-1/index.html",
        },
      }),
    );
    expect(s3.send).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        input: {
          Bucket: "artifact-bucket",
          Key: "artifacts/thread-1/artifact-1/scene.js",
        },
      }),
    );
    expect(loaded).toEqual({
      threadId: "thread-1",
      messages: [
        {
          id: "message-1",
          role: "user",
          content: "Teach me cells",
          createdAt: "2026-06-09T14:00:00.000Z",
          artifactId: undefined,
        },
        {
          id: "message-2",
          role: "assistant",
          content: "Here is the cell model.",
          createdAt: "2026-06-09T14:02:00.000Z",
          artifactId: "artifact-1",
        },
      ],
      artifacts: [
        {
          id: "artifact-1",
          title: "Cell Explorer",
          topic: "cells",
          summary: "A guided cell room.",
          html: "<!doctype html><html><body>cell</body></html>",
          sceneSource: "const nucleus = {};",
          components: [{ id: "nucleus", label: "Nucleus" }],
          walkthroughSteps: [{ id: "intro", title: "Intro", narration: "Start at the nucleus.", targetComponentIds: ["nucleus"] }],
          createdAt: "2026-06-09T14:01:00.000Z",
        },
      ],
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
