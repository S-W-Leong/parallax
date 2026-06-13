import { describe, expect, it, vi } from "vitest";
import type { AgentInputItem } from "@openai/agents";
import type { ArtifactRecord, ChatMessage } from "@/lib/artifacts/artifactTypes";
import { readAwsStorageConfig } from "@/lib/cloud/awsConfig";
import { AwsThreadStore, InMemoryThreadStore, ResilientThreadStore, type ThreadStore } from "@/lib/cloud/threadStore";

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
  lessonMode: "playground",
  interactionGoal: "Adjust the jet engine controls to compare airflow and thrust.",
  sources: [
    {
      title: "NASA Turbofan Overview",
      url: "https://www.nasa.gov/turbofan",
      summary: "A concise reference for fan, compressor, combustor, and turbine flow.",
    },
  ],
  controls: [
    { id: "airflow", type: "range", label: "Airflow", min: 0, max: 100, step: 5, value: 50 },
    { id: "labels", type: "toggle", label: "Labels", value: true },
  ],
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

const sessionUserItem = {
  type: "message",
  role: "user",
  content: "Teach me cells",
} satisfies AgentInputItem;

const sessionAssistantItem = {
  type: "message",
  role: "assistant",
  status: "completed",
  content: [{ type: "output_text", text: "Cells use membranes to separate inside from outside." }],
} satisfies AgentInputItem;

function hasNestedUndefined(value: unknown): boolean {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.some(hasNestedUndefined);
  if (value && typeof value === "object") return Object.values(value).some(hasNestedUndefined);
  return false;
}

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
      send: vi
        .fn()
        .mockResolvedValueOnce({
          Item: {
            PK: "USER#demo-1",
            SK: "THREAD#thread-1",
            entityType: "thread",
            userId: "demo-1",
            threadId: "thread-1",
            title: "Cells",
            createdAt: "2026-06-09T14:00:00.000Z",
            updatedAt: "2026-06-09T14:02:00.000Z",
          },
        })
        .mockResolvedValueOnce({
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
              lessonMode: "playground",
              interactionGoal: "Toggle labels to compare the nucleus with the membrane.",
              sources: [
                {
                  title: "NIH Cell Basics",
                  url: "https://www.nih.gov/cell-basics",
                  summary: "Overview of organelles and their roles in cell structure.",
                },
              ],
              controls: [{ id: "labels", type: "toggle", label: "Labels", value: true }],
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

    const loaded = await store.loadThread("demo-1", "thread-1");

    expect(dynamo.send.mock.calls[0][0].input).toMatchObject({
      TableName: "threads-table",
      Key: {
        PK: "USER#demo-1",
        SK: "THREAD#thread-1",
      },
    });
    expect(dynamo.send.mock.calls[1][0].input).toMatchObject({
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
          lessonMode: "playground",
          interactionGoal: "Toggle labels to compare the nucleus with the membrane.",
          sources: [
            {
              title: "NIH Cell Basics",
              url: "https://www.nih.gov/cell-basics",
              summary: "Overview of organelles and their roles in cell structure.",
            },
          ],
          controls: [{ id: "labels", type: "toggle", label: "Labels", value: true }],
          html: "<!doctype html><html><body>cell</body></html>",
          sceneSource: "const nucleus = {};",
          components: [{ id: "nucleus", label: "Nucleus" }],
          walkthroughSteps: [{ id: "intro", title: "Intro", narration: "Start at the nucleus.", targetComponentIds: ["nucleus"] }],
          createdAt: "2026-06-09T14:01:00.000Z",
        },
      ],
    });
  });

  it("does not load archived or missing thread summaries", async () => {
    const s3 = { send: vi.fn().mockResolvedValue({}) };
    const archivedDynamo = {
      send: vi.fn().mockResolvedValue({
        Item: {
          PK: "USER#demo-1",
          SK: "THREAD#thread-1",
          entityType: "thread",
          userId: "demo-1",
          threadId: "thread-1",
          title: "Cells",
          createdAt: "2026-06-09T14:00:00.000Z",
          updatedAt: "2026-06-09T14:02:00.000Z",
          archivedAt: "2026-06-09T15:00:00.000Z",
        },
      }),
    };
    const missingDynamo = { send: vi.fn().mockResolvedValue({}) };

    await expect(new AwsThreadStore({ dynamo: archivedDynamo, s3, tableName: "threads-table", bucketName: "artifact-bucket" }).loadThread("demo-1", "thread-1")).rejects.toThrow(
      "Thread not found",
    );
    await expect(new AwsThreadStore({ dynamo: missingDynamo, s3, tableName: "threads-table", bucketName: "artifact-bucket" }).loadThread("demo-1", "thread-1")).rejects.toThrow(
      "Thread not found",
    );
    expect(archivedDynamo.send).toHaveBeenCalledTimes(1);
    expect(missingDynamo.send).toHaveBeenCalledTimes(1);
    expect(s3.send).not.toHaveBeenCalled();
  });

  it("hydrates legacy artifacts without lessonMode as guided walkthrough", async () => {
    const dynamo = {
      send: vi
        .fn()
        .mockResolvedValueOnce({
          Item: {
            PK: "USER#demo-1",
            SK: "THREAD#thread-1",
            entityType: "thread",
            userId: "demo-1",
            threadId: "thread-1",
            title: "Cells",
            createdAt: "2026-06-09T14:00:00.000Z",
            updatedAt: "2026-06-09T14:02:00.000Z",
          },
        })
        .mockResolvedValueOnce({
          Items: [
            {
              PK: "THREAD#thread-1",
              SK: "ARTIFACT#2026-06-09T14:01:00.000Z#artifact-1",
              entityType: "artifact",
              threadId: "thread-1",
              artifactId: "artifact-1",
              title: "Cell Explorer",
              topic: "cells",
              summary: "A guided cell room.",
              interactionGoal: "Compare organelles.",
              controls: [{ id: "labels", type: "toggle", label: "Labels", value: true }],
              htmlS3Key: "artifacts/thread-1/artifact-1/index.html",
              sceneSourceS3Key: "artifacts/thread-1/artifact-1/scene.js",
              components: [{ id: "nucleus", label: "Nucleus" }],
              walkthroughSteps: [{ id: "intro", title: "Intro", narration: "Start at the nucleus.", targetComponentIds: ["nucleus"] }],
              createdAt: "2026-06-09T14:01:00.000Z",
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

    const loaded = await store.loadThread("demo-1", "thread-1");

    expect(loaded.artifacts[0]?.lessonMode).toBe("guided_walkthrough");
  });

  it("validates ownership, updates the summary, and persists a message under the thread partition", async () => {
    const dynamo = { send: vi.fn().mockResolvedValue({}) };
    const s3 = { send: vi.fn().mockResolvedValue({}) };
    const store = new AwsThreadStore({ dynamo, s3, tableName: "threads-table", bucketName: "artifact-bucket" });

    await store.appendMessage("demo-1", "thread-1", message);

    expect(dynamo.send.mock.calls[0][0].input).toMatchObject({
      TableName: "threads-table",
      Key: {
        PK: "USER#demo-1",
        SK: "THREAD#thread-1",
      },
      UpdateExpression: "SET updatedAt = :updatedAt, title = :title",
      ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK) AND attribute_not_exists(archivedAt)",
      ExpressionAttributeValues: {
        ":updatedAt": "2026-06-09T14:00:00.000Z",
        ":title": "Teach me turbines",
      },
    });
    expect(dynamo.send.mock.calls[1][0].input).toMatchObject({
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

    await store.saveArtifact("demo-1", "thread-1", artifact);

    expect(dynamo.send.mock.calls[0][0].input).toMatchObject({
      TableName: "threads-table",
      Key: {
        PK: "USER#demo-1",
        SK: "THREAD#thread-1",
      },
      UpdateExpression: "SET updatedAt = :updatedAt, title = :title",
      ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK) AND attribute_not_exists(archivedAt)",
      ExpressionAttributeValues: {
        ":updatedAt": artifact.createdAt,
        ":title": artifact.title,
      },
    });
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
    expect(dynamo.send.mock.calls[1][0].input.Item).toMatchObject({
      PK: "THREAD#thread-1",
      SK: "ARTIFACT#artifact-1",
      entityType: "artifact",
      lessonMode: "playground",
      interactionGoal: "Adjust the jet engine controls to compare airflow and thrust.",
      sources: [
        {
          title: "NASA Turbofan Overview",
          url: "https://www.nasa.gov/turbofan",
          summary: "A concise reference for fan, compressor, combustor, and turbine flow.",
        },
      ],
      controls: [
        { id: "airflow", type: "range", label: "Airflow", min: 0, max: 100, step: 5, value: 50 },
        { id: "labels", type: "toggle", label: "Labels", value: true },
      ],
      htmlS3Key: "artifacts/thread-1/artifact-1/index.html",
      sceneSourceS3Key: "artifacts/thread-1/artifact-1/scene.js",
    });
  });

  it("omits undefined learning outcomes when saving artifact metadata", async () => {
    const dynamo = { send: vi.fn().mockResolvedValue({}) };
    const s3 = { send: vi.fn().mockResolvedValue({}) };
    const store = new AwsThreadStore({ dynamo, s3, tableName: "threads-table", bucketName: "artifact-bucket" });

    await store.saveArtifact("demo-1", "thread-1", artifact);

    expect(dynamo.send.mock.calls[1][0].input.Item).not.toHaveProperty("learningOutcomes");
  });

  it("removes nested undefined values from saved artifact metadata", async () => {
    const dynamo = { send: vi.fn().mockResolvedValue({}) };
    const s3 = { send: vi.fn().mockResolvedValue({}) };
    const store = new AwsThreadStore({ dynamo, s3, tableName: "threads-table", bucketName: "artifact-bucket" });
    const artifactWithUndefinedFields: ArtifactRecord = {
      ...artifact,
      components: [
        {
          id: "fan",
          label: "Fan",
          description: undefined,
          metadata: {
            role: "intake",
            note: undefined,
            nested: { keep: "yes", drop: undefined },
            list: [{ name: "blade", value: undefined }],
          },
        },
      ],
      walkthroughSteps: [
        {
          id: "intro",
          title: "Intro",
          narration: "Start at the fan.",
          targetComponentIds: ["fan"],
          camera: {
            position: undefined,
            lookAt: [0, 0, 0],
          },
        },
      ],
      learningOutcomes: ["Trace airflow"],
    };

    await store.saveArtifact("demo-1", "thread-1", artifactWithUndefinedFields);

    const item = dynamo.send.mock.calls[1][0].input.Item;
    expect(hasNestedUndefined(item)).toBe(false);
    expect(item.components[0]).not.toHaveProperty("description");
    expect(item.components[0].metadata).not.toHaveProperty("note");
    expect(item.components[0].metadata.nested).not.toHaveProperty("drop");
    expect(item.components[0].metadata.list[0]).not.toHaveProperty("value");
    expect(item.walkthroughSteps[0].camera).not.toHaveProperty("position");
    expect(item.walkthroughSteps[0].camera.lookAt).toEqual([0, 0, 0]);
    expect(item.learningOutcomes).toEqual(["Trace airflow"]);
  });

  it("stores SDK session items under the thread partition", async () => {
    const dynamo = { send: vi.fn().mockResolvedValue({}) };
    const s3 = { send: vi.fn().mockResolvedValue({}) };
    const store = new AwsThreadStore({ dynamo, s3, tableName: "threads-table", bucketName: "artifact-bucket" });

    await store.appendAgentSessionItems("demo-1", "thread-1", [sessionUserItem, sessionAssistantItem]);

    expect(dynamo.send).toHaveBeenCalledTimes(3);
    expect(dynamo.send.mock.calls[0][0].input).toMatchObject({
      TableName: "threads-table",
      Key: {
        PK: "USER#demo-1",
        SK: "THREAD#thread-1",
      },
      UpdateExpression: "SET updatedAt = :updatedAt",
      ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK) AND attribute_not_exists(archivedAt)",
    });
    expect(dynamo.send.mock.calls[1][0].input.Item).toMatchObject({
      PK: "THREAD#thread-1",
      entityType: "agent_session_item",
      threadId: "thread-1",
      item: sessionUserItem,
    });
    expect(dynamo.send.mock.calls[1][0].input.Item.SK).toMatch(/^AGENT_SESSION#/);
    expect(dynamo.send.mock.calls[2][0].input.Item).toMatchObject({
      PK: "THREAD#thread-1",
      entityType: "agent_session_item",
      threadId: "thread-1",
      item: sessionAssistantItem,
    });
  });

  it("validates ownership before reading SDK session history and returns limited items chronologically", async () => {
    const dynamo = {
      send: vi
        .fn()
        .mockResolvedValueOnce({
          Item: {
            PK: "USER#demo-1",
            SK: "THREAD#thread-1",
            entityType: "thread",
            userId: "demo-1",
            threadId: "thread-1",
            title: "Cells",
            createdAt: "2026-06-09T14:00:00.000Z",
            updatedAt: "2026-06-09T14:02:00.000Z",
          },
        })
        .mockResolvedValueOnce({
          Items: [
            {
              PK: "THREAD#thread-1",
              SK: "AGENT_SESSION#2026-06-09T14:02:00.000Z#000002#item-2",
              entityType: "agent_session_item",
              threadId: "thread-1",
              item: sessionAssistantItem,
            },
            {
              PK: "THREAD#thread-1",
              SK: "AGENT_SESSION#2026-06-09T14:01:00.000Z#000001#item-1",
              entityType: "agent_session_item",
              threadId: "thread-1",
              item: sessionUserItem,
            },
          ],
        }),
    };
    const s3 = { send: vi.fn().mockResolvedValue({}) };
    const store = new AwsThreadStore({ dynamo, s3, tableName: "threads-table", bucketName: "artifact-bucket" });

    const items = await store.getAgentSessionItems("demo-1", "thread-1", 2);

    expect(dynamo.send.mock.calls[0][0].input).toMatchObject({
      TableName: "threads-table",
      Key: {
        PK: "USER#demo-1",
        SK: "THREAD#thread-1",
      },
    });
    expect(dynamo.send.mock.calls[1][0].input).toMatchObject({
      TableName: "threads-table",
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sessionPrefix)",
      ExpressionAttributeValues: {
        ":pk": "THREAD#thread-1",
        ":sessionPrefix": "AGENT_SESSION#",
      },
      ScanIndexForward: false,
      Limit: 2,
    });
    expect(items).toEqual([sessionUserItem, sessionAssistantItem]);
  });

  it("does not read SDK session items for archived or missing threads", async () => {
    const s3 = { send: vi.fn().mockResolvedValue({}) };
    const archivedDynamo = {
      send: vi.fn().mockResolvedValue({
        Item: {
          PK: "USER#demo-1",
          SK: "THREAD#thread-1",
          entityType: "thread",
          userId: "demo-1",
          threadId: "thread-1",
          title: "Cells",
          createdAt: "2026-06-09T14:00:00.000Z",
          updatedAt: "2026-06-09T14:02:00.000Z",
          archivedAt: "2026-06-09T15:00:00.000Z",
        },
      }),
    };
    const missingDynamo = { send: vi.fn().mockResolvedValue({}) };

    await expect(new AwsThreadStore({ dynamo: archivedDynamo, s3, tableName: "threads-table", bucketName: "artifact-bucket" }).getAgentSessionItems("demo-1", "thread-1")).rejects.toThrow(
      "Thread not found",
    );
    await expect(new AwsThreadStore({ dynamo: missingDynamo, s3, tableName: "threads-table", bucketName: "artifact-bucket" }).getAgentSessionItems("demo-1", "thread-1")).rejects.toThrow(
      "Thread not found",
    );
    expect(archivedDynamo.send).toHaveBeenCalledTimes(1);
    expect(missingDynamo.send).toHaveBeenCalledTimes(1);
    expect(s3.send).not.toHaveBeenCalled();
  });
});

describe("InMemoryThreadStore", () => {
  it("keeps threads, messages, artifacts, and SDK session items available without AWS", async () => {
    const store = new InMemoryThreadStore();

    const thread = await store.createThread({
      userId: "demo-1",
      title: "New chat",
      now: "2026-06-09T14:00:00.000Z",
      threadId: "thread-1",
    });
    await store.appendMessage("demo-1", "thread-1", message);
    await store.saveArtifact("demo-1", "thread-1", artifact);
    await store.appendAgentSessionItems("demo-1", "thread-1", [sessionUserItem, sessionAssistantItem]);

    const threads = await store.listThreads("demo-1");
    expect(threads).toEqual([
      {
        ...thread,
        title: artifact.title,
        updatedAt: expect.any(String),
      },
    ]);
    await expect(store.loadThread("demo-1", "thread-1")).resolves.toMatchObject({
      threadId: "thread-1",
      messages: [message],
      artifacts: [artifact],
    });
    await expect(store.getAgentSessionItems("demo-1", "thread-1", 1)).resolves.toEqual([sessionAssistantItem]);
  });

  it("creates an empty local thread when cloud history cannot be hydrated into memory", async () => {
    const store = new InMemoryThreadStore();

    await expect(store.loadThread("demo-1", "thread-from-cloud")).resolves.toMatchObject({
      threadId: "thread-from-cloud",
      messages: [],
      artifacts: [],
    });
    await expect(store.listThreads("demo-1")).resolves.toHaveLength(1);
  });
});

describe("ResilientThreadStore", () => {
  function makeAwsUnavailableError(): Error {
    return Object.assign(new Error("The security token included in the request is expired"), {
      name: "ExpiredTokenException",
      $metadata: { httpStatusCode: 403 },
    });
  }

  function makeUnavailablePrimary(): ThreadStore {
    return {
      createThread: vi.fn().mockRejectedValue(makeAwsUnavailableError()),
      listThreads: vi.fn().mockRejectedValue(makeAwsUnavailableError()),
      loadThread: vi.fn().mockRejectedValue(makeAwsUnavailableError()),
      archiveThread: vi.fn().mockRejectedValue(makeAwsUnavailableError()),
      appendMessage: vi.fn().mockRejectedValue(makeAwsUnavailableError()),
      saveArtifact: vi.fn().mockRejectedValue(makeAwsUnavailableError()),
      getAgentSessionItems: vi.fn().mockRejectedValue(makeAwsUnavailableError()),
      appendAgentSessionItems: vi.fn().mockRejectedValue(makeAwsUnavailableError()),
      popAgentSessionItem: vi.fn().mockRejectedValue(makeAwsUnavailableError()),
      clearAgentSession: vi.fn().mockRejectedValue(makeAwsUnavailableError()),
    };
  }

  it("falls back to in-memory storage when AWS credentials are revoked", async () => {
    const primary = makeUnavailablePrimary();
    const fallback = new InMemoryThreadStore();
    const logger = { warn: vi.fn() };
    const store = new ResilientThreadStore(primary, fallback, logger);

    await expect(
      store.createThread({
        userId: "demo-1",
        title: "New chat",
        now: "2026-06-09T14:00:00.000Z",
        threadId: "thread-1",
      }),
    ).resolves.toEqual({
      id: "thread-1",
      title: "New chat",
      createdAt: "2026-06-09T14:00:00.000Z",
      updatedAt: "2026-06-09T14:00:00.000Z",
    });
    await expect(store.listThreads("demo-1")).resolves.toHaveLength(1);

    expect(primary.createThread).toHaveBeenCalledTimes(1);
    expect(primary.listThreads).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("does not hide non-AWS storage errors", async () => {
    const primary = makeUnavailablePrimary();
    primary.listThreads = vi.fn().mockRejectedValue(new Error("Thread index parser exploded"));
    const store = new ResilientThreadStore(primary, new InMemoryThreadStore(), { warn: vi.fn() });

    await expect(store.listThreads("demo-1")).rejects.toThrow("Thread index parser exploded");
  });
});
