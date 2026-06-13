import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { InMemoryThreadStore } from "./inMemoryThreadStore";
import type { AgentInputItem } from "@openai/agents";
import type { ArtifactRecord, ChatMessage } from "@/lib/artifacts/artifactTypes";
import { readAwsStorageConfig } from "./awsConfig";
import {
  agentSessionItemKey,
  agentSessionItemPrefix,
  artifactHtmlKey,
  artifactKey,
  artifactSourceKey,
  threadOwnerKey,
  threadPartitionKey,
  threadSummaryKey,
  toChatMessage,
  toMessageRecord,
  toThreadSummary,
  type AgentSessionItemRecord,
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
  appendMessage(userId: string, threadId: string, message: ChatMessage): Promise<void>;
  saveArtifact(userId: string, threadId: string, artifact: ArtifactRecord): Promise<void>;
  getAgentSessionItems(userId: string, threadId: string, limit?: number): Promise<AgentInputItem[]>;
  appendAgentSessionItems(userId: string, threadId: string, items: AgentInputItem[]): Promise<void>;
  popAgentSessionItem(userId: string, threadId: string): Promise<AgentInputItem | undefined>;
  clearAgentSession(userId: string, threadId: string): Promise<void>;
};

async function bodyToString(body: unknown): Promise<string> {
  if (!body || typeof body !== "object" || !("transformToString" in body)) {
    throw new Error("Expected S3 response body to support transformToString.");
  }
  return (body as { transformToString: () => Promise<string> }).transformToString();
}

function removeUndefinedProperties<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(removeUndefinedProperties) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([entryKey, entryValue]) => [entryKey, removeUndefinedProperties(entryValue)]),
    ) as T;
  }

  return value;
}

let agentSessionSequence = 0;

function nextAgentSessionSequence(): number {
  agentSessionSequence = (agentSessionSequence + 1) % 1_000_000;
  return agentSessionSequence;
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
          lessonMode: record.lessonMode ?? "guided_walkthrough",
          interactionGoal: record.interactionGoal,
          sources: record.sources,
          controls: record.controls,
          html: await bodyToString((htmlObject as { Body?: unknown }).Body),
          sceneSource: await bodyToString((sourceObject as { Body?: unknown }).Body),
          components: record.components,
          walkthroughSteps: record.walkthroughSteps,
          learningOutcomes: record.learningOutcomes,
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

  private async touchThread(userId: string, threadId: string, updatedAt: string, title?: string): Promise<void> {
    await this.options.dynamo.send(
      new UpdateCommand({
        TableName: this.options.tableName,
        Key: {
          PK: threadOwnerKey(userId),
          SK: threadSummaryKey(threadId),
        },
        UpdateExpression: title ? "SET updatedAt = :updatedAt, title = :title" : "SET updatedAt = :updatedAt",
        ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK) AND attribute_not_exists(archivedAt)",
        ExpressionAttributeValues: {
          ":updatedAt": updatedAt,
          ...(title ? { ":title": title } : {}),
        },
      }),
    );
  }

  private async ensureThreadAccessible(userId: string, threadId: string): Promise<void> {
    const result = await this.options.dynamo.send(
      new GetCommand({
        TableName: this.options.tableName,
        Key: {
          PK: threadOwnerKey(userId),
          SK: threadSummaryKey(threadId),
        },
      }),
    );
    const summary = (result as { Item?: ThreadSummaryRecord }).Item;
    if (!summary || summary.archivedAt) {
      throw new Error("Thread not found");
    }
  }

  async appendMessage(userId: string, threadId: string, message: ChatMessage): Promise<void> {
    await this.touchThread(userId, threadId, message.createdAt, message.role === "user" ? titleFromMessage(message.content) : undefined);
    await this.options.dynamo.send(
      new PutCommand({
        TableName: this.options.tableName,
        Item: toMessageRecord(message, threadId),
      }),
    );
  }

  async saveArtifact(userId: string, threadId: string, artifact: ArtifactRecord): Promise<void> {
    await this.touchThread(userId, threadId, artifact.createdAt, artifact.title);

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
      components: removeUndefinedProperties(artifact.components),
      walkthroughSteps: removeUndefinedProperties(artifact.walkthroughSteps),
      createdAt: artifact.createdAt,
    };
    if (artifact.lessonMode !== undefined) {
      record.lessonMode = artifact.lessonMode;
    }
    if (artifact.interactionGoal !== undefined) {
      record.interactionGoal = artifact.interactionGoal;
    }
    if (artifact.sources !== undefined) {
      record.sources = removeUndefinedProperties(artifact.sources);
    }
    if (artifact.controls !== undefined) {
      record.controls = removeUndefinedProperties(artifact.controls);
    }
    if (artifact.learningOutcomes !== undefined) {
      record.learningOutcomes = removeUndefinedProperties(artifact.learningOutcomes);
    }

    await this.options.dynamo.send(
      new PutCommand({
        TableName: this.options.tableName,
        Item: record,
      }),
    );
  }

  async getAgentSessionItems(userId: string, threadId: string, limit?: number): Promise<AgentInputItem[]> {
    await this.ensureThreadAccessible(userId, threadId);

    const result = await this.options.dynamo.send(
      new QueryCommand({
        TableName: this.options.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sessionPrefix)",
        ExpressionAttributeValues: {
          ":pk": threadPartitionKey(threadId),
          ":sessionPrefix": agentSessionItemPrefix(),
        },
        ...(limit ? { ScanIndexForward: false, Limit: limit } : {}),
      }),
    );

    const records = ((result as { Items?: AgentSessionItemRecord[] }).Items ?? []);
    const chronological = limit ? [...records].reverse() : records;
    return chronological.map((record) => record.item);
  }

  async appendAgentSessionItems(userId: string, threadId: string, items: AgentInputItem[]): Promise<void> {
    if (items.length === 0) return;

    await this.touchThread(userId, threadId, new Date().toISOString());
    await Promise.all(
      items.map((item) => {
        const record: AgentSessionItemRecord = {
          PK: threadPartitionKey(threadId),
          SK: agentSessionItemKey(new Date().toISOString(), nextAgentSessionSequence(), crypto.randomUUID()),
          entityType: "agent_session_item",
          threadId,
          item: removeUndefinedProperties(item),
        };

        return this.options.dynamo.send(
          new PutCommand({
            TableName: this.options.tableName,
            Item: record,
          }),
        );
      }),
    );
  }

  async popAgentSessionItem(userId: string, threadId: string): Promise<AgentInputItem | undefined> {
    await this.ensureThreadAccessible(userId, threadId);

    const result = await this.options.dynamo.send(
      new QueryCommand({
        TableName: this.options.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sessionPrefix)",
        ExpressionAttributeValues: {
          ":pk": threadPartitionKey(threadId),
          ":sessionPrefix": agentSessionItemPrefix(),
        },
        ScanIndexForward: false,
        Limit: 1,
      }),
    );
    const record = ((result as { Items?: AgentSessionItemRecord[] }).Items ?? [])[0];
    if (!record) return undefined;

    await this.options.dynamo.send(
      new DeleteCommand({
        TableName: this.options.tableName,
        Key: { PK: record.PK, SK: record.SK },
      }),
    );

    return record.item;
  }

  async clearAgentSession(userId: string, threadId: string): Promise<void> {
    await this.ensureThreadAccessible(userId, threadId);

    const result = await this.options.dynamo.send(
      new QueryCommand({
        TableName: this.options.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sessionPrefix)",
        ExpressionAttributeValues: {
          ":pk": threadPartitionKey(threadId),
          ":sessionPrefix": agentSessionItemPrefix(),
        },
      }),
    );

    const records = (result as { Items?: AgentSessionItemRecord[] }).Items ?? [];
    await Promise.all(
      records.map((record) =>
        this.options.dynamo.send(
          new DeleteCommand({
            TableName: this.options.tableName,
            Key: { PK: record.PK, SK: record.SK },
          }),
        ),
      ),
    );
  }
}

function titleFromMessage(content: string): string {
  const compact = content.trim().replace(/\s+/g, " ");
  if (!compact) return "New chat";
  return compact.length > 48 ? `${compact.slice(0, 45)}...` : compact;
}

export class InMemoryThreadStore implements ThreadStore {
  private readonly summariesByUserId = new Map<string, ThreadSummaryRecord[]>();
  private readonly messagesByThreadId = new Map<string, ChatMessage[]>();
  private readonly artifactsByThreadId = new Map<string, ArtifactRecord[]>();
  private readonly agentSessionItemsByThreadId = new Map<string, AgentInputItem[]>();

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
    this.upsertSummary(record);
    return toThreadSummary(record);
  }

  async listThreads(userId: string): Promise<PersistedThreadSummary[]> {
    return (this.summariesByUserId.get(userId) ?? [])
      .filter((record) => !record.archivedAt)
      .map(toThreadSummary)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async loadThread(userId: string, threadId: string): Promise<LoadedThread> {
    const summary = this.findSummary(userId, threadId);
    if (summary?.archivedAt) {
      throw new Error("Thread not found");
    }
    if (!summary) {
      await this.createThread({
        userId,
        threadId,
        title: "New chat",
        now: new Date().toISOString(),
      });
    }

    return {
      threadId,
      messages: [...(this.messagesByThreadId.get(threadId) ?? [])],
      artifacts: [...(this.artifactsByThreadId.get(threadId) ?? [])],
    };
  }

  async archiveThread(userId: string, threadId: string, archivedAt: string): Promise<void> {
    const summary = this.findSummary(userId, threadId);
    if (!summary) throw new Error("Thread not found");
    summary.archivedAt = archivedAt;
  }

  async appendMessage(userId: string, threadId: string, message: ChatMessage): Promise<void> {
    this.touchThread(userId, threadId, message.createdAt, message.role === "user" ? titleFromMessage(message.content) : undefined);
    this.messagesByThreadId.set(threadId, [...(this.messagesByThreadId.get(threadId) ?? []), message]);
  }

  async saveArtifact(userId: string, threadId: string, artifact: ArtifactRecord): Promise<void> {
    this.touchThread(userId, threadId, artifact.createdAt, artifact.title);
    const existing = this.artifactsByThreadId.get(threadId) ?? [];
    this.artifactsByThreadId.set(threadId, [...existing.filter((item) => item.id !== artifact.id), artifact]);
  }

  async getAgentSessionItems(_userId: string, threadId: string, limit?: number): Promise<AgentInputItem[]> {
    const items = this.agentSessionItemsByThreadId.get(threadId) ?? [];
    return limit ? items.slice(-limit) : [...items];
  }

  async appendAgentSessionItems(userId: string, threadId: string, items: AgentInputItem[]): Promise<void> {
    if (items.length === 0) return;
    this.touchThread(userId, threadId, new Date().toISOString());
    this.agentSessionItemsByThreadId.set(threadId, [...(this.agentSessionItemsByThreadId.get(threadId) ?? []), ...items]);
  }

  async popAgentSessionItem(_userId: string, threadId: string): Promise<AgentInputItem | undefined> {
    const items = this.agentSessionItemsByThreadId.get(threadId) ?? [];
    const item = items.at(-1);
    this.agentSessionItemsByThreadId.set(threadId, items.slice(0, -1));
    return item;
  }

  async clearAgentSession(_userId: string, threadId: string): Promise<void> {
    this.agentSessionItemsByThreadId.delete(threadId);
  }

  private findSummary(userId: string, threadId: string): ThreadSummaryRecord | undefined {
    return (this.summariesByUserId.get(userId) ?? []).find((record) => record.threadId === threadId);
  }

  private touchThread(userId: string, threadId: string, updatedAt: string, title?: string): void {
    const existing = this.findSummary(userId, threadId);
    if (existing) {
      existing.updatedAt = updatedAt;
      if (title) existing.title = title;
      return;
    }

    this.upsertSummary({
      PK: threadOwnerKey(userId),
      SK: threadSummaryKey(threadId),
      entityType: "thread",
      userId,
      threadId,
      title: title ?? "New chat",
      createdAt: updatedAt,
      updatedAt,
    });
  }

  private upsertSummary(record: ThreadSummaryRecord): void {
    const summaries = this.summariesByUserId.get(record.userId) ?? [];
    this.summariesByUserId.set(record.userId, [...summaries.filter((summary) => summary.threadId !== record.threadId), record]);
  }
}

type ThreadStoreOperation<T> = {
  label: string;
  primary: () => Promise<T>;
  fallback: () => Promise<T>;
};

type StorageFallbackLogger = Pick<typeof console, "warn">;

function isAwsStorageError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { name?: string; Code?: string; code?: string; $metadata?: unknown };
  const name = record.name ?? record.Code ?? record.code ?? "";
  return Boolean(
    record.$metadata ||
      [
        "AccessDenied",
        "AccessDeniedException",
        "CredentialsProviderError",
        "ExpiredToken",
        "ExpiredTokenException",
        "InvalidAccessKeyId",
        "ResourceNotFoundException",
        "UnrecognizedClientException",
      ].includes(name),
  );
}

export class ResilientThreadStore implements ThreadStore {
  private primaryDisabled = false;

  constructor(
    private readonly primary: ThreadStore,
    private readonly fallback: ThreadStore,
    private readonly logger: StorageFallbackLogger = console,
  ) {}

  async createThread(input: CreateThreadInput): Promise<PersistedThreadSummary> {
    return this.withFallback({
      label: "createThread",
      primary: () => this.primary.createThread(input),
      fallback: () => this.fallback.createThread(input),
    });
  }

  async listThreads(userId: string): Promise<PersistedThreadSummary[]> {
    return this.withFallback({
      label: "listThreads",
      primary: () => this.primary.listThreads(userId),
      fallback: () => this.fallback.listThreads(userId),
    });
  }

  async loadThread(userId: string, threadId: string): Promise<LoadedThread> {
    return this.withFallback({
      label: "loadThread",
      primary: () => this.primary.loadThread(userId, threadId),
      fallback: () => this.fallback.loadThread(userId, threadId),
    });
  }

  async archiveThread(userId: string, threadId: string, archivedAt: string): Promise<void> {
    return this.withFallback({
      label: "archiveThread",
      primary: () => this.primary.archiveThread(userId, threadId, archivedAt),
      fallback: () => this.fallback.archiveThread(userId, threadId, archivedAt),
    });
  }

  async appendMessage(userId: string, threadId: string, message: ChatMessage): Promise<void> {
    return this.withFallback({
      label: "appendMessage",
      primary: () => this.primary.appendMessage(userId, threadId, message),
      fallback: () => this.fallback.appendMessage(userId, threadId, message),
    });
  }

  async saveArtifact(userId: string, threadId: string, artifact: ArtifactRecord): Promise<void> {
    return this.withFallback({
      label: "saveArtifact",
      primary: () => this.primary.saveArtifact(userId, threadId, artifact),
      fallback: () => this.fallback.saveArtifact(userId, threadId, artifact),
    });
  }

  async getAgentSessionItems(userId: string, threadId: string, limit?: number): Promise<AgentInputItem[]> {
    return this.withFallback({
      label: "getAgentSessionItems",
      primary: () => this.primary.getAgentSessionItems(userId, threadId, limit),
      fallback: () => this.fallback.getAgentSessionItems(userId, threadId, limit),
    });
  }

  async appendAgentSessionItems(userId: string, threadId: string, items: AgentInputItem[]): Promise<void> {
    return this.withFallback({
      label: "appendAgentSessionItems",
      primary: () => this.primary.appendAgentSessionItems(userId, threadId, items),
      fallback: () => this.fallback.appendAgentSessionItems(userId, threadId, items),
    });
  }

  async popAgentSessionItem(userId: string, threadId: string): Promise<AgentInputItem | undefined> {
    return this.withFallback({
      label: "popAgentSessionItem",
      primary: () => this.primary.popAgentSessionItem(userId, threadId),
      fallback: () => this.fallback.popAgentSessionItem(userId, threadId),
    });
  }

  async clearAgentSession(userId: string, threadId: string): Promise<void> {
    return this.withFallback({
      label: "clearAgentSession",
      primary: () => this.primary.clearAgentSession(userId, threadId),
      fallback: () => this.fallback.clearAgentSession(userId, threadId),
    });
  }

  private async withFallback<T>(operation: ThreadStoreOperation<T>): Promise<T> {
    if (this.primaryDisabled) return operation.fallback();

    try {
      return await operation.primary();
    } catch (error) {
      if (!isAwsStorageError(error)) throw error;
      this.primaryDisabled = true;
      this.logger.warn("Parallax AWS thread storage is unavailable; using in-memory thread storage for this runtime.", {
        operation: operation.label,
        error: error instanceof Error ? error.message : String(error),
      });
      return operation.fallback();
    }
  }
}

let singleton: ThreadStore | null = null;

export function getThreadStore(): ThreadStore {
  if (singleton) return singleton;
  let config;
  try {
    config = readAwsStorageConfig();
  } catch (error) {
    console.warn("Parallax AWS thread storage is not configured; using in-memory thread storage.", {
      error: error instanceof Error ? error.message : String(error),
    });
    singleton = new InMemoryThreadStore();
    return singleton;
  }

  const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.region }));
  const s3 = new S3Client({ region: config.region });
  const awsStore = new AwsThreadStore({
    dynamo,
    s3,
    tableName: config.tableName,
    bucketName: config.bucketName,
  });
  singleton = new ResilientThreadStore(awsStore, new InMemoryThreadStore());
  return singleton;
}
