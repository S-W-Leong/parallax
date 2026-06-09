import { PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  threadOwnerKey,
  threadSummaryKey,
  toThreadSummary,
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
}
