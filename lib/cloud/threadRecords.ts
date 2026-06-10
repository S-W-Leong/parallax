import type { ArtifactRecord, ChatMessage } from "@/lib/artifacts/artifactTypes";

export type PersistedThreadSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type ThreadSummaryRecord = {
  PK: string;
  SK: string;
  entityType: "thread";
  userId: string;
  threadId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
};

export type MessageRecord = {
  PK: string;
  SK: string;
  entityType: "message";
  threadId: string;
  id: string;
  role: ChatMessage["role"];
  content: string;
  createdAt: string;
  artifactId?: string;
};

export type ArtifactMetadataRecord = {
  PK: string;
  SK: string;
  entityType: "artifact";
  threadId: string;
  artifactId: string;
  title: string;
  topic: string;
  summary: string;
  htmlS3Key: string;
  sceneSourceS3Key: string;
  components: ArtifactRecord["components"];
  walkthroughSteps: ArtifactRecord["walkthroughSteps"];
  lessonMode?: ArtifactRecord["lessonMode"];
  interactionGoal?: ArtifactRecord["interactionGoal"];
  sources?: ArtifactRecord["sources"];
  controls?: ArtifactRecord["controls"];
  learningOutcomes?: ArtifactRecord["learningOutcomes"];
  createdAt: string;
};

export function threadOwnerKey(userId: string): string {
  return `USER#${userId}`;
}

export function threadPartitionKey(threadId: string): string {
  return `THREAD#${threadId}`;
}

export function threadSummaryKey(threadId: string): string {
  return `THREAD#${threadId}`;
}

export function messageKey(createdAt: string, messageId: string): string {
  return `MESSAGE#${createdAt}#${messageId}`;
}

export function artifactKey(artifactId: string): string {
  return `ARTIFACT#${artifactId}`;
}

export function artifactHtmlKey(threadId: string, artifactId: string): string {
  return `artifacts/${threadId}/${artifactId}/index.html`;
}

export function artifactSourceKey(threadId: string, artifactId: string): string {
  return `artifacts/${threadId}/${artifactId}/scene.js`;
}

export function toThreadSummary(record: ThreadSummaryRecord): PersistedThreadSummary {
  return {
    id: record.threadId,
    title: record.title,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function toMessageRecord(message: ChatMessage, threadId: string): MessageRecord {
  const record: MessageRecord = {
    PK: threadPartitionKey(threadId),
    SK: messageKey(message.createdAt, message.id),
    entityType: "message",
    threadId,
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
  };
  if (message.artifactId !== undefined) {
    record.artifactId = message.artifactId;
  }
  return record;
}

export function toChatMessage(record: MessageRecord): ChatMessage {
  return {
    id: record.id,
    role: record.role,
    content: record.content,
    createdAt: record.createdAt,
    artifactId: record.artifactId,
  };
}
