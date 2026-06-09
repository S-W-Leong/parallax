import { PutObjectCommand } from "@aws-sdk/client-s3";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import type { ArtifactRecord, ChatMessage } from "@/lib/artifacts/artifactTypes";
import {
  artifactHtmlKey,
  artifactKey,
  artifactSourceKey,
  threadOwnerKey,
  threadPartitionKey,
  threadSummaryKey,
  toMessageRecord,
  toThreadSummary,
  type ArtifactMetadataRecord,
  type PersistedThreadSummary,
  type ThreadSummaryRecord,
} from "./threadRecords";

type SendableClient = {
  send: (command: { input?: unknown }) => Promise<unknown>;
};

export type CreateThreadInput = {
  userId: string;
  title: string;
  now: string;
  threadId: string;
};

export type ThreadStore = {
  createThread(input: CreateThreadInput): Promise<PersistedThreadSummary>;
  appendMessage(threadId: string, message: ChatMessage): Promise<void>;
  saveArtifact(threadId: string, artifact: ArtifactRecord): Promise<void>;
};

export class AwsThreadStore implements ThreadStore {
  constructor(
    private readonly options: {
      dynamo: SendableClient;
      s3: SendableClient;
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
