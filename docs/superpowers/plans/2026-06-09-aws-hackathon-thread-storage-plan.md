# AWS Hackathon Thread Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ChatGPT-style multi-thread chat history for the Parallax hackathon demo, backed by DynamoDB for threads/messages/artifact metadata and S3 for generated artifact HTML/source.

**Architecture:** Keep the existing reducer as the active-thread UI state, but stop treating localStorage as the durable source of truth. Add a server-side storage adapter that writes thread records to one DynamoDB table and artifact payloads to one private S3 bucket; expose small Next.js API routes for listing, creating, loading, and archiving threads. The demo uses a localStorage `demoUserId` instead of full auth.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, AWS SDK v3, DynamoDB single-table design, S3 private object storage, existing OpenAI Agents SDK route.

---

## Scope

Build only the hackathon version:

- Multi-thread sidebar.
- Create/select/archive thread.
- Persist messages across reloads.
- Persist generated artifact metadata in DynamoDB.
- Persist generated artifact `html` and `sceneSource` in S3.
- Keep `OPENAI_API_KEY` and the current OpenAI Agents SDK path.
- No Cognito, Aurora, Bedrock migration, Step Functions, SQS, sharing permissions, or account system.

## AWS Setup

Use one DynamoDB table and one private S3 bucket.

Required environment variables:

```bash
AWS_REGION=ap-southeast-1
PARALLAX_THREADS_TABLE=parallax-hackathon-threads
```

Keep the existing `OPENAI_API_KEY` value already used by the app.

Create the DynamoDB table:

```bash
aws dynamodb create-table \
  --table-name parallax-hackathon-threads \
  --attribute-definitions AttributeName=PK,AttributeType=S AttributeName=SK,AttributeType=S \
  --key-schema AttributeName=PK,KeyType=HASH AttributeName=SK,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region ap-southeast-1
```

Create and lock down the S3 bucket:

```bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ARTIFACT_BUCKET="parallax-hackathon-artifacts-${AWS_ACCOUNT_ID}"
aws s3 mb "s3://${ARTIFACT_BUCKET}" --region ap-southeast-1
aws s3api put-public-access-block \
  --bucket "${ARTIFACT_BUCKET}" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

After creating the bucket, append the bucket name to `.env.local`:

```bash
printf "PARALLAX_ARTIFACT_BUCKET=parallax-hackathon-artifacts-%s\n" "$(aws sts get-caller-identity --query Account --output text)" >> .env.local
```

## File Structure

Create:

- `lib/demo/demoUser.ts` - browser helper for a stable anonymous demo user ID.
- `lib/cloud/awsConfig.ts` - validates AWS-related env variables and exposes config.
- `lib/cloud/threadRecords.ts` - pure DynamoDB key builders, record types, and conversion helpers.
- `lib/cloud/threadStore.ts` - interface plus AWS-backed implementation for threads, messages, and artifacts.
- `lib/threads/threadSession.ts` - converts persisted thread data into the existing `LearningSession` shape.
- `components/chat/ThreadSidebar.tsx` - thread list, selected thread, new chat, archive.
- `app/api/threads/route.ts` - `GET` list threads and `POST` create thread.
- `app/api/threads/[threadId]/route.ts` - `GET` load one thread and `DELETE` archive one thread.
- `tests/thread-records.test.ts` - pure key/conversion tests.
- `tests/thread-session.test.ts` - persisted records to `LearningSession` tests.
- `tests/thread-store.test.ts` - mocked AWS SDK store tests.
- `tests/thread-api.test.ts` - mocked repository API route tests.

Modify:

- `package.json` - add AWS SDK dependencies.
- `lib/session/sessionReducer.ts` - add `session_loaded`.
- `lib/session/usePersistentSession.ts` - demote to local fallback or replace with `useThreadSession`.
- `components/app/ParallaxArtifactApp.tsx` - load thread list, active thread, and pass `threadId` to `/api/agent`.
- `lib/agent/routes.ts` - accept optional `threadId` and `demoUserId`; persist chat/learning-room messages and artifacts.
- `app/api/agent/route.ts` - no route split; keep single gateway.
- `app/globals.css` - sidebar layout styles.

---

### Task 1: Add AWS SDK Dependencies And Pure Thread Record Types

**Files:**
- Modify: `package.json`
- Create: `lib/cloud/threadRecords.ts`
- Test: `tests/thread-records.test.ts`

- [x] **Step 1: Add AWS SDK dependencies**

Run:

```bash
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb @aws-sdk/client-s3
```

Expected: `package.json` and `package-lock.json` include the three AWS packages.

- [x] **Step 2: Write failing record helper tests**

Create `tests/thread-records.test.ts`:

```ts
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
```

- [x] **Step 3: Run the failing test**

Run:

```bash
npm run test -- tests/thread-records.test.ts
```

Expected: FAIL because `lib/cloud/threadRecords.ts` does not exist.

- [x] **Step 4: Implement pure record helpers**

Create `lib/cloud/threadRecords.ts`:

```ts
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
  return {
    PK: threadPartitionKey(threadId),
    SK: messageKey(message.createdAt, message.id),
    entityType: "message",
    threadId,
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    artifactId: message.artifactId,
  };
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
```

- [x] **Step 5: Verify the test passes**

Run:

```bash
npm run test -- tests/thread-records.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/cloud/threadRecords.ts tests/thread-records.test.ts
git commit -m "feat: define hackathon thread storage records"
```

---

### Task 2: Add AWS Config And Thread Store Interface

**Files:**
- Create: `lib/cloud/awsConfig.ts`
- Create: `lib/cloud/threadStore.ts`
- Test: `tests/thread-store.test.ts`

- [x] **Step 1: Write failing config and store tests**

Create `tests/thread-store.test.ts`:

```ts
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
```

- [x] **Step 2: Run the failing test**

Run:

```bash
npm run test -- tests/thread-store.test.ts
```

Expected: FAIL because `awsConfig.ts` and `threadStore.ts` do not exist.

- [x] **Step 3: Implement AWS config**

Create `lib/cloud/awsConfig.ts`:

```ts
export type AwsStorageConfig = {
  region: string;
  tableName: string;
  bucketName: string;
};

type Env = Record<string, string | undefined>;

function required(env: Env, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`${key} is required for Parallax AWS storage.`);
  return value;
}

export function readAwsStorageConfig(env: Env = process.env): AwsStorageConfig {
  return {
    region: required(env, "AWS_REGION"),
    tableName: required(env, "PARALLAX_THREADS_TABLE"),
    bucketName: required(env, "PARALLAX_ARTIFACT_BUCKET"),
  };
}
```

- [x] **Step 4: Implement minimal thread store**

Create `lib/cloud/threadStore.ts`:

```ts
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
```

- [x] **Step 5: Verify the store test passes**

Run:

```bash
npm run test -- tests/thread-store.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add lib/cloud/awsConfig.ts lib/cloud/threadStore.ts tests/thread-store.test.ts
git commit -m "feat: add AWS thread store shell"
```

---

### Task 3: Complete Store Methods For Listing, Loading, Messages, And Artifacts

**Files:**
- Modify: `lib/cloud/threadStore.ts`
- Modify: `lib/cloud/threadRecords.ts`
- Test: `tests/thread-store.test.ts`
- Test: `tests/thread-session.test.ts`
- Create: `lib/threads/threadSession.ts`

- [x] **Step 1: Add failing store behavior tests**

Append to `tests/thread-store.test.ts`:

```ts
import type { ArtifactRecord, ChatMessage } from "@/lib/artifacts/artifactTypes";

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
```

- [x] **Step 2: Add failing session conversion tests**

Create `tests/thread-session.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createSessionFromThread } from "@/lib/threads/threadSession";
import type { ArtifactRecord, ChatMessage } from "@/lib/artifacts/artifactTypes";

const messages: ChatMessage[] = [
  { id: "message-1", role: "user", content: "Teach me jet engines", createdAt: "2026-06-09T14:00:00.000Z" },
  { id: "message-2", role: "assistant", content: "I built Jet Engine Explorer.", createdAt: "2026-06-09T14:01:00.000Z", artifactId: "artifact-1" },
];

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

describe("createSessionFromThread", () => {
  it("maps persisted thread messages and artifacts into the active LearningSession shape", () => {
    const session = createSessionFromThread({
      threadId: "thread-1",
      messages,
      artifacts: [artifact],
    });

    expect(session).toMatchObject({
      id: "thread-1",
      mode: "chat",
      messages,
      artifacts: { "artifact-1": artifact },
      activeArtifactId: null,
      lastArtifactId: "artifact-1",
      selectedComponent: null,
      activeStepId: null,
      pendingCommands: [],
      trace: [],
    });
  });
});
```

- [x] **Step 3: Run failing tests**

Run:

```bash
npm run test -- tests/thread-store.test.ts tests/thread-session.test.ts
```

Expected: FAIL because `appendMessage`, `saveArtifact`, and `createSessionFromThread` are missing.

- [x] **Step 4: Implement session conversion**

Create `lib/threads/threadSession.ts`:

```ts
import type { ArtifactRecord, ChatMessage, LearningSession } from "@/lib/artifacts/artifactTypes";

export function createSessionFromThread(input: {
  threadId: string;
  messages: ChatMessage[];
  artifacts: ArtifactRecord[];
}): LearningSession {
  const artifacts = Object.fromEntries(input.artifacts.map((artifact) => [artifact.id, artifact]));
  const lastArtifactId = [...input.messages].reverse().find((message) => message.artifactId)?.artifactId ?? null;

  return {
    id: input.threadId,
    mode: "chat",
    messages: input.messages,
    artifacts,
    activeArtifactId: null,
    lastArtifactId,
    selectedComponent: null,
    activeStepId: null,
    pendingCommands: [],
    trace: [],
  };
}
```

- [x] **Step 5: Complete store write methods**

Update `lib/cloud/threadStore.ts` with these imports:

```ts
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
```

Add methods to `AwsThreadStore`:

```ts
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
```

Update the `ThreadStore` type:

```ts
export type ThreadStore = {
  createThread(input: CreateThreadInput): Promise<PersistedThreadSummary>;
  appendMessage(threadId: string, message: ChatMessage): Promise<void>;
  saveArtifact(threadId: string, artifact: ArtifactRecord): Promise<void>;
};
```

- [x] **Step 6: Verify tests pass**

Run:

```bash
npm run test -- tests/thread-store.test.ts tests/thread-session.test.ts
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add lib/cloud/threadStore.ts lib/cloud/threadRecords.ts lib/threads/threadSession.ts tests/thread-store.test.ts tests/thread-session.test.ts
git commit -m "feat: persist thread messages and artifact payloads"
```

---

### Task 4: Add Thread API Routes

**Files:**
- Create: `app/api/threads/route.ts`
- Create: `app/api/threads/[threadId]/route.ts`
- Modify: `lib/cloud/threadStore.ts`
- Test: `tests/thread-api.test.ts`

- [x] **Step 1: Add store methods for list, load, and archive**

Extend `ThreadStore` in `lib/cloud/threadStore.ts`:

```ts
export type LoadedThread = {
  threadId: string;
  messages: ChatMessage[];
  artifacts: ArtifactRecord[];
};

export type ThreadStore = {
  createThread(input: CreateThreadInput): Promise<PersistedThreadSummary>;
  listThreads(userId: string): Promise<PersistedThreadSummary[]>;
  loadThread(threadId: string): Promise<LoadedThread>;
  archiveThread(userId: string, threadId: string, archivedAt: string): Promise<void>;
  appendMessage(threadId: string, message: ChatMessage): Promise<void>;
  saveArtifact(threadId: string, artifact: ArtifactRecord): Promise<void>;
};
```

Use `QueryCommand`, `UpdateCommand`, and `GetObjectCommand` to implement:

```ts
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
```

Add these imports to `lib/cloud/threadStore.ts`:

```ts
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { toChatMessage, type ArtifactMetadataRecord, type MessageRecord } from "./threadRecords";
```

Add this helper to `lib/cloud/threadStore.ts`:

```ts
async function bodyToString(body: unknown): Promise<string> {
  if (!body || typeof body !== "object" || !("transformToString" in body)) {
    throw new Error("Expected S3 response body to support transformToString.");
  }
  return (body as { transformToString: () => Promise<string> }).transformToString();
}
```

Add this `loadThread` method to `AwsThreadStore`:

```ts
async loadThread(threadId: string): Promise<LoadedThread> {
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
```

Add this `archiveThread` method to `AwsThreadStore`:

```ts
async archiveThread(userId: string, threadId: string, archivedAt: string): Promise<void> {
  await this.options.dynamo.send(
    new UpdateCommand({
      TableName: this.options.tableName,
      Key: {
        PK: threadOwnerKey(userId),
        SK: threadSummaryKey(threadId),
      },
      UpdateExpression: "SET archivedAt = :archivedAt",
      ExpressionAttributeValues: {
        ":archivedAt": archivedAt,
      },
    }),
  );
}
```

- [x] **Step 2: Write failing API tests**

Create `tests/thread-api.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createSessionFromThread } from "@/lib/threads/threadSession";

vi.mock("@/lib/cloud/threadStore", () => {
  return {
    getThreadStore: vi.fn(),
  };
});

const { getThreadStore } = await import("@/lib/cloud/threadStore");
const mockedGetThreadStore = vi.mocked(getThreadStore);

describe("thread API contract helpers", () => {
  it("can convert a loaded persisted thread into the session returned by GET /api/threads/[threadId]", () => {
    const session = createSessionFromThread({
      threadId: "thread-1",
      messages: [{ id: "message-1", role: "user", content: "Teach me cells", createdAt: "2026-06-09T14:00:00.000Z" }],
      artifacts: [],
    });

    expect(session.id).toBe("thread-1");
    expect(session.messages).toHaveLength(1);
  });

  it("uses a store object that can be mocked for route tests", async () => {
    mockedGetThreadStore.mockReturnValue({
      createThread: vi.fn(),
      listThreads: vi.fn().mockResolvedValue([{ id: "thread-1", title: "Cells", createdAt: "a", updatedAt: "b" }]),
      loadThread: vi.fn(),
      archiveThread: vi.fn(),
      appendMessage: vi.fn(),
      saveArtifact: vi.fn(),
    });

    const store = mockedGetThreadStore();
    await expect(store.listThreads("demo-1")).resolves.toEqual([{ id: "thread-1", title: "Cells", createdAt: "a", updatedAt: "b" }]);
  });
});
```

- [x] **Step 3: Run failing API tests**

Run:

```bash
npm run test -- tests/thread-api.test.ts
```

Expected: FAIL because `getThreadStore` does not exist.

- [x] **Step 4: Add `getThreadStore` factory**

Add to `lib/cloud/threadStore.ts`:

```ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { readAwsStorageConfig } from "./awsConfig";

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
```

- [x] **Step 5: Create thread routes**

Create `app/api/threads/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getThreadStore } from "@/lib/cloud/threadStore";

const createThreadSchema = z.object({
  userId: z.string().min(1),
  title: z.string().min(1).default("New chat"),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
  const threads = await getThreadStore().listThreads(userId);
  return NextResponse.json({ threads });
}

export async function POST(request: Request) {
  const body = createThreadSchema.parse(await request.json());
  const now = new Date().toISOString();
  const thread = await getThreadStore().createThread({
    userId: body.userId,
    title: body.title,
    now,
    threadId: crypto.randomUUID(),
  });
  return NextResponse.json({ thread });
}
```

Create `app/api/threads/[threadId]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getThreadStore } from "@/lib/cloud/threadStore";
import { createSessionFromThread } from "@/lib/threads/threadSession";

type RouteContext = {
  params: Promise<{ threadId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { threadId } = await context.params;
  const loaded = await getThreadStore().loadThread(threadId);
  return NextResponse.json({ session: createSessionFromThread(loaded) });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { threadId } = await context.params;
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
  await getThreadStore().archiveThread(userId, threadId, new Date().toISOString());
  return NextResponse.json({ ok: true });
}
```

- [x] **Step 6: Verify API-related tests**

Run:

```bash
npm run test -- tests/thread-api.test.ts tests/thread-store.test.ts tests/thread-session.test.ts
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add app/api/threads lib/cloud/threadStore.ts tests/thread-api.test.ts
git commit -m "feat: expose persisted chat thread APIs"
```

---

### Task 5: Persist Agent Messages And Artifacts

**Files:**
- Modify: `lib/agent/routes.ts`
- Test: `tests/agent-routes.test.ts`

- [x] **Step 1: Add failing agent persistence test**

Append to `tests/agent-routes.test.ts`:

```ts
vi.mock("@/lib/cloud/threadStore", () => {
  return {
    getThreadStore: vi.fn(),
  };
});

const { getThreadStore } = await import("@/lib/cloud/threadStore");
const mockedGetThreadStore = vi.mocked(getThreadStore);

it("persists user and assistant messages when a threadId is present", async () => {
  const appendMessage = vi.fn().mockResolvedValue(undefined);
  mockedGetThreadStore.mockReturnValue({
    createThread: vi.fn(),
    listThreads: vi.fn(),
    loadThread: vi.fn(),
    archiveThread: vi.fn(),
    appendMessage,
    saveArtifact: vi.fn(),
  });
  mockedRun.mockResolvedValueOnce({ finalOutput: "Sure, let's explore turbines." } as Awaited<ReturnType<typeof run>>);

  await handleAgentRoute({
    mode: "chat",
    threadId: "thread-1",
    userId: "demo-1",
    message: "Teach me turbines",
    messages: [],
  });

  expect(appendMessage).toHaveBeenCalledTimes(2);
  expect(appendMessage.mock.calls[0][0]).toBe("thread-1");
  expect(appendMessage.mock.calls[0][1]).toMatchObject({ role: "user", content: "Teach me turbines" });
  expect(appendMessage.mock.calls[1][1]).toMatchObject({ role: "assistant", content: "Sure, let's explore turbines." });
});
```

- [x] **Step 2: Run failing test**

Run:

```bash
npm run test -- tests/agent-routes.test.ts
```

Expected: FAIL because the route schema rejects `threadId` and no persistence happens.

- [x] **Step 3: Extend route schemas**

In `lib/agent/routes.ts`, add:

```ts
const persistedThreadContextSchema = z.object({
  threadId: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
});
```

Merge it into both route schemas:

```ts
const chatAgentRequestSchema = z.object({
  mode: z.literal("chat"),
  message: z.string().min(1),
  messages: z.array(chatMessageSchema).default([]),
}).merge(persistedThreadContextSchema);

const learningRoomAgentRequestSchema = z.object({
  mode: z.literal("learning_room"),
  message: z.string().min(1),
  artifact: artifactRecordSchema,
  messages: z.array(chatMessageSchema).default([]),
  selectedComponent: selectedComponentSchema.nullable(),
  activeStepId: z.string().nullable(),
}).merge(persistedThreadContextSchema);
```

- [x] **Step 4: Add message factory and persistence helper**

In `lib/agent/routes.ts`, add:

```ts
import type { ArtifactRecord, ChatMessage } from "@/lib/artifacts/artifactTypes";
import { getThreadStore } from "@/lib/cloud/threadStore";

function makeMessage(role: ChatMessage["role"], content: string, artifactId?: string): ChatMessage {
  return {
    id: `message-${crypto.randomUUID()}`,
    role,
    content,
    createdAt: new Date().toISOString(),
    artifactId,
  };
}

async function persistIfThreaded(threadId: string | undefined, messages: ChatMessage[], artifact?: ArtifactRecord | null) {
  if (!threadId) return;
  const store = getThreadStore();
  for (const message of messages) {
    await store.appendMessage(threadId, message);
  }
  if (artifact) {
    await store.saveArtifact(threadId, artifact);
  }
}
```

In `handleChatMode`, before running the agent:

```ts
const userMessage = makeMessage("user", request.message);
```

After determining the response without artifact:

```ts
const assistantMessage = makeMessage("assistant", finalOutputText(result.finalOutput, "I can help you learn STEM topics or build an interactive 3D experience."));
await persistIfThreaded(request.threadId, [userMessage, assistantMessage]);
return {
  message: assistantMessage.content,
  trace: [],
  artifact: null,
  error: null,
};
```

After a successful artifact:

```ts
const messageText = finalOutputText(result.finalOutput, `I built ${artifactResult.artifact.title}.`);
const assistantMessage = makeMessage("assistant", messageText, artifactResult.artifact.id);
await persistIfThreaded(request.threadId, [userMessage, assistantMessage], artifactResult.artifact);
return {
  message: messageText,
  trace,
  artifact: artifactResult.artifact,
  error: null,
};
```

- [x] **Step 5: Verify agent route tests**

Run:

```bash
npm run test -- tests/agent-routes.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add lib/agent/routes.ts tests/agent-routes.test.ts
git commit -m "feat: persist agent messages to chat threads"
```

---

### Task 6: Add Demo User And Client Thread Session Hook

**Files:**
- Create: `lib/demo/demoUser.ts`
- Create: `lib/session/useThreadSession.ts`
- Modify: `lib/session/sessionReducer.ts`
- Test: `tests/session-reducer.test.ts`

- [x] **Step 1: Add failing reducer test for loading a session**

Append to `tests/session-reducer.test.ts`:

```ts
it("replaces active state with a loaded persisted thread session", () => {
  const existing = sessionReducer(createEmptySession(), { type: "user_message", content: "Old local chat" });
  const loaded = {
    ...createEmptySession(),
    id: "thread-1",
    messages: [{ id: "message-1", role: "user" as const, content: "Persisted chat", createdAt: "2026-06-09T14:00:00.000Z" }],
  };

  const next = sessionReducer(existing, { type: "session_loaded", session: loaded });

  expect(next.id).toBe("thread-1");
  expect(next.messages).toHaveLength(1);
  expect(next.messages[0].content).toBe("Persisted chat");
});
```

- [x] **Step 2: Run failing reducer test**

Run:

```bash
npm run test -- tests/session-reducer.test.ts
```

Expected: FAIL because `session_loaded` does not exist.

- [x] **Step 3: Add reducer action**

Update `lib/session/sessionReducer.ts`:

```ts
| { type: "session_loaded"; session: LearningSession }
```

Add switch case:

```ts
case "session_loaded":
  return action.session;
```

- [x] **Step 4: Create demo user helper**

Create `lib/demo/demoUser.ts`:

```ts
const DEMO_USER_KEY = "parallax.demoUserId";

export function getDemoUserId(): string {
  if (typeof window === "undefined") return "demo-server";
  const existing = window.localStorage.getItem(DEMO_USER_KEY);
  if (existing) return existing;
  const created = `demo-${crypto.randomUUID()}`;
  window.localStorage.setItem(DEMO_USER_KEY, created);
  return created;
}
```

- [x] **Step 5: Create thread session hook**

Create `lib/session/useThreadSession.ts`:

```ts
"use client";

import { useEffect, useReducer, useState } from "react";
import type { LearningSession } from "@/lib/artifacts/artifactTypes";
import type { PersistedThreadSummary } from "@/lib/cloud/threadRecords";
import { getDemoUserId } from "@/lib/demo/demoUser";
import { createEmptySession, sessionReducer, type SessionAction } from "./sessionReducer";

type ThreadListResponse = { threads: PersistedThreadSummary[] };
type CreateThreadResponse = { thread: PersistedThreadSummary };
type LoadThreadResponse = { session: LearningSession };

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || !data) throw new Error("Thread API request failed");
  return data;
}

export function useThreadSession(): {
  userId: string | null;
  activeThreadId: string | null;
  threads: PersistedThreadSummary[];
  state: LearningSession;
  dispatch: React.Dispatch<SessionAction>;
  hydrated: boolean;
  createThread: () => Promise<void>;
  selectThread: (threadId: string) => Promise<void>;
  archiveThread: (threadId: string) => Promise<void>;
} {
  const [hydrated, setHydrated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<PersistedThreadSummary[]>([]);
  const [state, dispatch] = useReducer(sessionReducer, undefined, createEmptySession);

  useEffect(() => {
    const nextUserId = getDemoUserId();
    setUserId(nextUserId);
    fetch(`/api/threads?userId=${encodeURIComponent(nextUserId)}`)
      .then((response) => readJson<ThreadListResponse>(response))
      .then(async (data) => {
        setThreads(data.threads);
        if (data.threads[0]) {
          await selectThread(data.threads[0].id);
        }
      })
      .finally(() => setHydrated(true));
  }, []);

  async function createThread() {
    if (!userId) return;
    const data = await readJson<CreateThreadResponse>(
      await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, title: "New chat" }),
      }),
    );
    setThreads((current) => [data.thread, ...current]);
    setActiveThreadId(data.thread.id);
    dispatch({ type: "session_loaded", session: { ...createEmptySession(), id: data.thread.id } });
  }

  async function selectThread(threadId: string) {
    const data = await readJson<LoadThreadResponse>(await fetch(`/api/threads/${encodeURIComponent(threadId)}`));
    setActiveThreadId(threadId);
    dispatch({ type: "session_loaded", session: data.session });
  }

  async function archiveThread(threadId: string) {
    if (!userId) return;
    await fetch(`/api/threads/${encodeURIComponent(threadId)}?userId=${encodeURIComponent(userId)}`, { method: "DELETE" });
    setThreads((current) => current.filter((thread) => thread.id !== threadId));
    if (activeThreadId === threadId) {
      setActiveThreadId(null);
      dispatch({ type: "reset_session" });
    }
  }

  return { userId, activeThreadId, threads, state, dispatch, hydrated, createThread, selectThread, archiveThread };
}
```

- [x] **Step 6: Verify reducer test**

Run:

```bash
npm run test -- tests/session-reducer.test.ts
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add lib/demo/demoUser.ts lib/session/useThreadSession.ts lib/session/sessionReducer.ts tests/session-reducer.test.ts
git commit -m "feat: load active state from persisted threads"
```

---

### Task 7: Add Thread Sidebar And Wire Client To Thread APIs

**Files:**
- Create: `components/chat/ThreadSidebar.tsx`
- Modify: `components/app/ParallaxArtifactApp.tsx`
- Modify: `app/globals.css`

- [x] **Step 1: Create sidebar component**

Create `components/chat/ThreadSidebar.tsx`:

```tsx
"use client";

import { Archive, MessageSquarePlus } from "lucide-react";
import type { PersistedThreadSummary } from "@/lib/cloud/threadRecords";

type ThreadSidebarProps = {
  threads: PersistedThreadSummary[];
  activeThreadId: string | null;
  onCreateThread: () => void;
  onSelectThread: (threadId: string) => void;
  onArchiveThread: (threadId: string) => void;
};

export function ThreadSidebar({ threads, activeThreadId, onCreateThread, onSelectThread, onArchiveThread }: ThreadSidebarProps) {
  return (
    <aside className="thread-sidebar">
      <header>
        <div className="lab-mark">Parallax</div>
        <button className="icon-button" type="button" onClick={onCreateThread} aria-label="New chat" title="New chat">
          <MessageSquarePlus size={18} />
        </button>
      </header>
      <nav aria-label="Chat threads">
        {threads.map((thread) => (
          <div className={thread.id === activeThreadId ? "thread-item active" : "thread-item"} key={thread.id}>
            <button type="button" onClick={() => onSelectThread(thread.id)}>
              <span>{thread.title}</span>
            </button>
            <button className="icon-button" type="button" onClick={() => onArchiveThread(thread.id)} aria-label={`Archive ${thread.title}`}>
              <Archive size={15} />
            </button>
          </div>
        ))}
      </nav>
    </aside>
  );
}
```

- [x] **Step 2: Replace local persistent hook usage**

In `components/app/ParallaxArtifactApp.tsx`, replace:

```ts
import { usePersistentSession } from "@/lib/session/usePersistentSession";
```

with:

```ts
import { ThreadSidebar } from "@/components/chat/ThreadSidebar";
import { useThreadSession } from "@/lib/session/useThreadSession";
```

Replace:

```ts
const [state, dispatch, hydrated] = usePersistentSession();
```

with:

```ts
const { userId, activeThreadId, threads, state, dispatch, hydrated, createThread, selectThread, archiveThread } = useThreadSession();
```

Update `/api/agent` chat body:

```ts
body: JSON.stringify({ mode: "chat", threadId: activeThreadId, userId, message, messages: state.messages }),
```

Update learning-room body:

```ts
body: JSON.stringify({
  mode: "learning_room",
  threadId: activeThreadId,
  userId,
  message,
  artifact: activeArtifact,
  messages: state.messages,
  selectedComponent: state.selectedComponent,
  activeStepId: state.activeStepId,
}),
```

Change `resetSession` to create a new persisted thread:

```ts
function resetSession() {
  void createThread();
}
```

Wrap both chat and learning-room renders in the sidebar layout:

```tsx
return (
  <main className="threaded-app-shell">
    <ThreadSidebar
      threads={threads}
      activeThreadId={activeThreadId}
      onCreateThread={() => void createThread()}
      onSelectThread={(threadId) => void selectThread(threadId)}
      onArchiveThread={(threadId) => void archiveThread(threadId)}
    />
    {/* existing chat or learning room content */}
  </main>
);
```

- [x] **Step 3: Add sidebar CSS**

Add to `app/globals.css`:

```css
.threaded-app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  background: var(--bg);
}

.thread-sidebar {
  min-height: 0;
  border-right: 1px solid var(--line);
  background: rgba(10, 13, 18, 0.98);
  padding: 12px;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
}

.thread-sidebar header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.thread-sidebar nav {
  min-height: 0;
  overflow: auto;
  display: grid;
  align-content: start;
  gap: 6px;
}

.thread-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 36px;
  gap: 6px;
  align-items: center;
}

.thread-item > button:first-child {
  min-width: 0;
  justify-content: flex-start;
}

.thread-item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thread-item.active > button:first-child {
  border-color: var(--accent);
  background: #1d2b2d;
}

@media (max-width: 860px) {
  .threaded-app-shell {
    grid-template-columns: 1fr;
  }

  .thread-sidebar {
    min-height: auto;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }

  .thread-sidebar nav {
    display: flex;
    overflow-x: auto;
  }

  .thread-item {
    min-width: 220px;
  }
}
```

- [x] **Step 4: Verify build catches prop/layout issues**

Run:

```bash
npm run build
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add components/chat/ThreadSidebar.tsx components/app/ParallaxArtifactApp.tsx app/globals.css
git commit -m "feat: add persistent chat thread sidebar"
```

---

### Task 8: End-To-End Demo Verification

**Files:**
- Modify only if verification exposes defects.

- [x] **Step 1: Run all tests**

Run:

```bash
npm run test
```

Expected: all tests pass.

- [x] **Step 2: Run production build**

Run:

```bash
npm run build
```

Expected: build completes successfully.

- [x] **Step 3: Start dev server**

Run:

```bash
npm run dev
```

Expected: app available at `http://localhost:3000` or the next available port.

- [ ] **Step 4: Manual demo script**

In the browser:

1. Open `http://localhost:3000`.
2. Click the new-chat button in the sidebar.
3. Send `i wanna learn about jet engines`.
4. Wait for the artifact proposal.
5. Enter the experience.
6. Ask `show me the combustor`.
7. Return to chat.
8. Create another thread.
9. Send `teach me cell membranes`.
10. Switch back to the jet-engine thread.

Expected:

- Thread list shows both threads.
- Jet-engine thread retains prior messages and artifact card.
- Cell thread has its own separate history.
- Generated artifact HTML loads from the persisted artifact record.
- Refreshing the browser keeps the thread list and active persisted messages.

- [ ] **Step 5: Inspect AWS resources**

Run:

```bash
aws dynamodb scan --table-name parallax-hackathon-threads --max-items 10 --region ap-southeast-1
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws s3 ls "s3://parallax-hackathon-artifacts-${AWS_ACCOUNT_ID}/artifacts/" --recursive
```

Expected:

- DynamoDB contains `thread`, `message`, and `artifact` records.
- S3 contains `index.html` and `scene.js` objects under `artifacts/<threadId>/<artifactId>/`.

- [ ] **Step 6: Commit verification fixes if any**

If fixes were needed:

```bash
git add <fixed-files>
git commit -m "fix: stabilize persisted thread demo"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review

Spec coverage:

- ChatGPT-style per-thread management: Tasks 4, 6, and 7.
- Hackathon AWS scope, not production architecture: AWS Setup and Scope sections.
- DynamoDB for threads/messages/artifact metadata: Tasks 1 through 4.
- S3 for generated artifact HTML/source: Task 3.
- Existing agent path preserved: Task 5 modifies `lib/agent/routes.ts` without replacing OpenAI Agents SDK.
- Client demo UX: Task 7.
- Verification: Task 8.

Plan quality scan:

- All code-producing steps include concrete paths and snippets.
- The only account-specific value is the AWS account ID, and the setup commands derive it with `aws sts get-caller-identity`.

Type consistency:

- `PersistedThreadSummary` is defined in `lib/cloud/threadRecords.ts` and used by `ThreadSidebar` and `useThreadSession`.
- `ThreadStore` is defined once in `lib/cloud/threadStore.ts`.
- `LearningSession` remains the active client shape.
- Artifact records remain compatible with the existing `ArtifactFrame` by hydrating S3 payloads before returning the loaded session.
