import type { AgentInputItem } from "@openai/agents";
import type { ArtifactRecord, ChatMessage } from "@/lib/artifacts/artifactTypes";
import type { PersistedThreadSummary } from "./threadRecords";
import type { CreateThreadInput, LoadedThread, ThreadStore } from "./threadStore";

type ThreadEntry = {
  userId: string;
  threadId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  messages: ChatMessage[];
  artifacts: ArtifactRecord[];
  agentSessionItems: AgentInputItem[];
};

function toSummary(entry: ThreadEntry): PersistedThreadSummary {
  return { id: entry.threadId, title: entry.title, createdAt: entry.createdAt, updatedAt: entry.updatedAt };
}

export class InMemoryThreadStore implements ThreadStore {
  private readonly threads = new Map<string, ThreadEntry>();
  private readonly userThreadIds = new Map<string, string[]>();

  async createThread(input: CreateThreadInput): Promise<PersistedThreadSummary> {
    const entry: ThreadEntry = {
      userId: input.userId,
      threadId: input.threadId,
      title: input.title,
      createdAt: input.now,
      updatedAt: input.now,
      messages: [],
      artifacts: [],
      agentSessionItems: [],
    };
    this.threads.set(input.threadId, entry);
    const ids = this.userThreadIds.get(input.userId) ?? [];
    ids.push(input.threadId);
    this.userThreadIds.set(input.userId, ids);
    return toSummary(entry);
  }

  async listThreads(userId: string): Promise<PersistedThreadSummary[]> {
    const ids = this.userThreadIds.get(userId) ?? [];
    return ids
      .map((id) => this.threads.get(id))
      .filter((e): e is ThreadEntry => e !== undefined && !e.archivedAt)
      .map(toSummary)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async loadThread(userId: string, threadId: string): Promise<LoadedThread> {
    const entry = this.get(userId, threadId);
    return { threadId, messages: [...entry.messages], artifacts: [...entry.artifacts] };
  }

  async archiveThread(userId: string, threadId: string, archivedAt: string): Promise<void> {
    this.get(userId, threadId).archivedAt = archivedAt;
  }

  async appendMessage(userId: string, threadId: string, message: ChatMessage): Promise<void> {
    const entry = this.get(userId, threadId);
    entry.messages.push(message);
    entry.updatedAt = message.createdAt;
    if (message.role === "user") entry.title = titleFromMessage(message.content);
  }

  async saveArtifact(userId: string, threadId: string, artifact: ArtifactRecord): Promise<void> {
    const entry = this.get(userId, threadId);
    const index = entry.artifacts.findIndex((a) => a.id === artifact.id);
    if (index === -1) entry.artifacts.push(artifact);
    else entry.artifacts[index] = artifact;
    entry.updatedAt = artifact.createdAt;
    entry.title = artifact.title;
  }

  async getAgentSessionItems(userId: string, threadId: string, limit?: number): Promise<AgentInputItem[]> {
    const items = this.get(userId, threadId).agentSessionItems;
    return limit ? items.slice(-limit) : [...items];
  }

  async appendAgentSessionItems(userId: string, threadId: string, items: AgentInputItem[]): Promise<void> {
    const entry = this.get(userId, threadId);
    entry.agentSessionItems.push(...items);
    entry.updatedAt = new Date().toISOString();
  }

  async popAgentSessionItem(userId: string, threadId: string): Promise<AgentInputItem | undefined> {
    return this.get(userId, threadId).agentSessionItems.pop();
  }

  async clearAgentSession(userId: string, threadId: string): Promise<void> {
    this.get(userId, threadId).agentSessionItems = [];
  }

  private get(userId: string, threadId: string): ThreadEntry {
    const entry = this.threads.get(threadId);
    if (!entry || entry.userId !== userId || entry.archivedAt) throw new Error("Thread not found");
    return entry;
  }
}

function titleFromMessage(content: string): string {
  const compact = content.trim().replace(/\s+/g, " ");
  return compact.length > 48 ? `${compact.slice(0, 45)}...` : compact || "New chat";
}
