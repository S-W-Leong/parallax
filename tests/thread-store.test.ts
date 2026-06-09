import { describe, expect, it, vi } from "vitest";
import { readAwsStorageConfig } from "@/lib/cloud/awsConfig";
import { AwsThreadStore } from "@/lib/cloud/threadStore";

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
});
