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
  type ArtifactMetadataRecord,
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

    const normalMessageRecord = toMessageRecord({
      id: "message-1",
      role: "user",
      content: "Teach me jet engines",
      createdAt: "2026-06-09T14:00:00.000Z",
    }, "thread-1");

    expect(normalMessageRecord).toMatchObject({
      PK: "THREAD#thread-1",
      SK: "MESSAGE#2026-06-09T14:00:00.000Z#message-1",
      entityType: "message",
      threadId: "thread-1",
      role: "user",
      content: "Teach me jet engines",
    });
    expect(normalMessageRecord).not.toHaveProperty("artifactId");

    expect(
      toMessageRecord({
        id: "message-2",
        role: "assistant",
        content: "Here is your room.",
        createdAt: "2026-06-09T14:01:00.000Z",
        artifactId: "artifact-1",
      }, "thread-1"),
    ).toMatchObject({
      PK: "THREAD#thread-1",
      SK: "MESSAGE#2026-06-09T14:01:00.000Z#message-2",
      entityType: "message",
      artifactId: "artifact-1",
    });
  });

  it("allows artifact metadata records to carry friendly learning outcomes", () => {
    const record: ArtifactMetadataRecord = {
      PK: "THREAD#thread-1",
      SK: "ARTIFACT#artifact-1",
      entityType: "artifact",
      threadId: "thread-1",
      artifactId: "artifact-1",
      title: "Jet Engine Lab",
      topic: "jet engines",
      summary: "Explore airflow, combustion, and thrust.",
      htmlS3Key: "artifacts/thread-1/artifact-1/index.html",
      sceneSourceS3Key: "artifacts/thread-1/artifact-1/scene.js",
      components: [
        { id: "fan", label: "Fan" },
        { id: "compressor", label: "Compressor" },
        { id: "combustor", label: "Combustor" },
      ],
      walkthroughSteps: [{ id: "intro", title: "Trace airflow", narration: "Follow the path.", targetComponentIds: ["fan"] }],
      learningOutcomes: ["Trace airflow", "Compare pressure zones", "See thrust form"],
      createdAt: "2026-06-10T00:00:00.000Z",
    };

    expect(record.learningOutcomes).toEqual(["Trace airflow", "Compare pressure zones", "See thrust form"]);
  });

  it("allows artifact metadata records to carry lesson metadata and controls", () => {
    const record: ArtifactMetadataRecord = {
      PK: "THREAD#thread-2",
      SK: "ARTIFACT#artifact-2",
      entityType: "artifact",
      threadId: "thread-2",
      artifactId: "artifact-2",
      title: "Spring Playground",
      topic: "oscillations",
      summary: "Manipulate displacement and observe energy storage.",
      htmlS3Key: "artifacts/thread-2/artifact-2/index.html",
      sceneSourceS3Key: "artifacts/thread-2/artifact-2/scene.js",
      components: [
        { id: "spring", label: "Spring" },
        { id: "mass", label: "Mass" },
        { id: "energy-bar", label: "Energy Bar" },
      ],
      walkthroughSteps: [],
      lessonMode: "playground",
      interactionGoal: "Adjust displacement to compare the system energy.",
      controls: [
        { id: "displacement", type: "range", label: "Displacement", min: -2, max: 2, step: 0.1, value: 0 },
        { id: "labels", type: "toggle", label: "Labels", value: true },
      ],
      createdAt: "2026-06-10T00:05:00.000Z",
    };

    expect(record.lessonMode).toBe("playground");
    expect(record.interactionGoal).toContain("displacement");
    expect(record.controls?.[0]?.id).toBe("displacement");
  });
});
