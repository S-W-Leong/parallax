import { describe, expect, it } from "vitest";
import {
  artifactHtmlKey,
  artifactSourceKey,
  messageKey,
  threadOwnerKey,
  threadPartitionKey,
  threadSummaryKey,
  toMessageRecord,
  toThreadSummary,
} from "@/lib/cloud/threadRecords";

describe("threadRecords", () => {
  it("builds stable DynamoDB keys for thread-owned data", () => {
    expect(threadOwnerKey("demo-1")).toBe("USER#demo-1");
    expect(threadPartitionKey("thread-1")).toBe("THREAD#thread-1");
    expect(threadSummaryKey("thread-1")).toBe("THREAD#thread-1");
    expect(messageKey("2026-06-09T14:00:00.000Z", "message-1")).toBe("MESSAGE#2026-06-09T14:00:00.000Z#message-1");
  });

  it("builds stable S3 keys for artifact payloads", () => {
    expect(artifactHtmlKey("thread-1", "artifact-1")).toBe("artifacts/thread-1/artifact-1/index.html");
    expect(artifactSourceKey("thread-1", "artifact-1")).toBe("artifacts/thread-1/artifact-1/scene.js");
  });

  it("converts stored thread and message records into app-facing shapes", () => {
    expect(
      toThreadSummary({
        PK: "USER#demo-1",
        SK: "THREAD#thread-1",
        entityType: "thread",
        userId: "demo-1",
        threadId: "thread-1",
        title: "Jet engines",
        createdAt: "2026-06-09T14:00:00.000Z",
        updatedAt: "2026-06-09T14:05:00.000Z",
      }),
    ).toEqual({
      id: "thread-1",
      title: "Jet engines",
      createdAt: "2026-06-09T14:00:00.000Z",
      updatedAt: "2026-06-09T14:05:00.000Z",
    });

    expect(
      toMessageRecord({
        id: "message-1",
        role: "user",
        content: "Teach me jet engines",
        createdAt: "2026-06-09T14:00:00.000Z",
      }, "thread-1"),
    ).toMatchObject({
      PK: "THREAD#thread-1",
      SK: "MESSAGE#2026-06-09T14:00:00.000Z#message-1",
      entityType: "message",
      threadId: "thread-1",
      role: "user",
      content: "Teach me jet engines",
    });
  });
});
