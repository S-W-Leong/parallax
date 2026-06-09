import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { ArtifactRecord, ChatMessage } from "@/lib/artifacts/artifactTypes";
import { readAwsStorageConfig } from "./awsConfig";
import {
  artifactHtmlKey,
  artifactKey,
  artifactSourceKey,
  threadOwnerKey,
  threadPartitionKey,
  threadSummaryKey,
  toChatMessage,
  toMessageRecord,
  toThreadSummary,
  type ArtifactMetadataRecord,
  type MessageRecord,
  type PersistedThreadSummary,
  type ThreadSummaryRecord,
} from "./threadRecords";

export type CreateThreadInput = {
  userId: string;
  title: string;
  now: string;
  threadId: string;
};

export type LoadedThread = {
  threadId: string;
  messages: ChatMessage[];
  artifacts: ArtifactRecord[];
};

export type ThreadStore = {
  createThread(input: CreateThreadInput): Promise<PersistedThreadSummary>;
  listThreads(userId: string): Promise<PersistedThreadSummary[]>;
  loadThread(userId: string, threadId: string): Promise<LoadedThread>;
  archiveThread(userId: string, threadId: string, archivedAt: string): Promise<void>;
  appendMessage(threadId: string, message: ChatMessage): Promise<void>;
  saveArtifact(threadId: string, artifact: ArtifactRecord): Promise<void>;
};

async function bodyToString(body: unknown): Promise<string> {
  if (!body || typeof body !== "object" || !("transformToString" in body)) {
    throw new Error("Expected S3 response body to support transformToString.");
  }
  return (body as { transformToString: () => Promise<string> }).transformToString();
}

export class AwsThreadStore implements ThreadStore {
  constructor(
    private readonly options: {
      dynamo: Pick<DynamoDBDocumentClient, "send">;
      s3: Pick<S3Client, "send">;
      tableName: string;
      bucketName: string;
    },
  ) {}

  async createThread(input: CreateThreadInput): Promise<PersistedThreadSummary> {
    const record: ThreadSummaryRecord = {
      PK: threadOwnerKey(input.userId),
      SK: threadSummaryKey(input.threadId),
      entityType: "thread",
      userId: input.userId,
      threadId: input.threadId,
      title: input.title,
      createdAt: input.now,
      updatedAt: input.now,
    };

    await this.options.dynamo.send(
      new PutCommand({
        TableName: this.options.tableName,
        Item: record,
        ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
      }),
    );

    return toThreadSummary(record);
  }

  async listThreads(userId: string): Promise<PersistedThreadSummary[]> {
    const result = await this.options.dynamo.send(
      new QueryCommand({
        TableName: this.options.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :threadPrefix)",
        FilterExpression: "attribute_not_exists(archivedAt)",
        ExpressionAttributeValues: {
          ":pk": threadOwnerKey(userId),
          ":threadPrefix": "THREAD#",
        },
      }),
    );

    return ((result as { Items?: ThreadSummaryRecord[] }).Items ?? [])
      .map(toThreadSummary)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async loadThread(userId: string, threadId: string): Promise<LoadedThread> {
    const summaryResult = await this.options.dynamo.send(
      new GetCommand({
        TableName: this.options.tableName,
        Key: {
          PK: threadOwnerKey(userId),
          SK: threadSummaryKey(threadId),
        },
      }),
    );
    const summary = (summaryResult as { Item?: ThreadSummaryRecord }).Item;
    if (!summary || summary.archivedAt) {
      throw new Error("Thread not found");
    }

    const result = await this.options.dynamo.send(
      new QueryCommand({
        TableName: this.options.tableName,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: {
          ":pk": threadPartitionKey(threadId),
        },
      }),
    );

    const items = (result as { Items?: Array<MessageRecord | ArtifactMetadataRecord> }).Items ?? [];
    const messages = items
      .filter((item): item is MessageRecord => item.entityType === "message")
      .map(toChatMessage)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const artifactRecords = items.filter((item): item is ArtifactMetadataRecord => item.entityType === "artifact");
    const artifacts = await Promise.all(
      artifactRecords.map(async (record) => {
        const htmlObject = await this.options.s3.send(
          new GetObjectCommand({
            Bucket: this.options.bucketName,
            Key: record.htmlS3Key,
          }),
        );
        const sourceObject = await this.options.s3.send(
          new GetObjectCommand({
            Bucket: this.options.bucketName,
            Key: record.sceneSourceS3Key,
          }),
        );

        return {
          id: record.artifactId,
          title: record.title,
          topic: record.topic,
          summary: record.summary,
          html: await bodyToString((htmlObject as { Body?: unknown }).Body),
          sceneSource: await bodyToString((sourceObject as { Body?: unknown }).Body),
          components: record.components,
          walkthroughSteps: record.walkthroughSteps,
          createdAt: record.createdAt,
        };
      }),
    );

    return { threadId, messages, artifacts };
  }

  async archiveThread(userId: string, threadId: string, archivedAt: string): Promise<void> {
    await this.options.dynamo.send(
      new UpdateCommand({
        TableName: this.options.tableName,
        Key: {
          PK: threadOwnerKey(userId),
          SK: threadSummaryKey(threadId),
        },
        UpdateExpression: "SET archivedAt = :archivedAt",
        ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)",
        ExpressionAttributeValues: {
          ":archivedAt": archivedAt,
        },
      }),
    );
  }

  async appendMessage(threadId: string, message: ChatMessage): Promise<void> {
    await this.options.dynamo.send(
      new PutCommand({
        TableName: this.options.tableName,
        Item: toMessageRecord(message, threadId),
      }),
    );
  }

  async saveArtifact(threadId: string, artifact: ArtifactRecord): Promise<void> {
    const htmlS3Key = artifactHtmlKey(threadId, artifact.id);
    const sceneSourceS3Key = artifactSourceKey(threadId, artifact.id);

    await this.options.s3.send(
      new PutObjectCommand({
        Bucket: this.options.bucketName,
        Key: htmlS3Key,
        Body: artifact.html,
        ContentType: "text/html; charset=utf-8",
      }),
    );

    await this.options.s3.send(
      new PutObjectCommand({
        Bucket: this.options.bucketName,
        Key: sceneSourceS3Key,
        Body: artifact.sceneSource,
        ContentType: "text/javascript; charset=utf-8",
      }),
    );

    const record: ArtifactMetadataRecord = {
      PK: threadPartitionKey(threadId),
      SK: artifactKey(artifact.id),
      entityType: "artifact",
      threadId,
      artifactId: artifact.id,
      title: artifact.title,
      topic: artifact.topic,
      summary: artifact.summary,
      htmlS3Key,
      sceneSourceS3Key,
      components: artifact.components,
      walkthroughSteps: artifact.walkthroughSteps,
      createdAt: artifact.createdAt,
    };

    await this.options.dynamo.send(
      new PutCommand({
        TableName: this.options.tableName,
        Item: record,
      }),
    );
  }
}

let singleton: ThreadStore | null = null;

export function getThreadStore(): ThreadStore {
  if (singleton) return singleton;
  const config = readAwsStorageConfig();
  const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.region }));
  const s3 = new S3Client({ region: config.region });
  singleton = new AwsThreadStore({
    dynamo,
    s3,
    tableName: config.tableName,
    bucketName: config.bucketName,
  });
  return singleton;
}
