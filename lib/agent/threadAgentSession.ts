import type { AgentInputItem, Session } from "@openai/agents";
import type { ThreadStore } from "@/lib/cloud/threadStore";

type ThreadAgentSessionOptions = {
  userId: string;
  threadId: string;
  store: ThreadStore;
};

export class ThreadAgentSession implements Session {
  constructor(private readonly options: ThreadAgentSessionOptions) {}

  async getSessionId(): Promise<string> {
    return this.options.threadId;
  }

  async getItems(limit?: number): Promise<AgentInputItem[]> {
    return this.options.store.getAgentSessionItems(this.options.userId, this.options.threadId, limit);
  }

  async addItems(items: AgentInputItem[]): Promise<void> {
    await this.options.store.appendAgentSessionItems(this.options.userId, this.options.threadId, items);
  }

  async popItem(): Promise<AgentInputItem | undefined> {
    return this.options.store.popAgentSessionItem(this.options.userId, this.options.threadId);
  }

  async clearSession(): Promise<void> {
    await this.options.store.clearAgentSession(this.options.userId, this.options.threadId);
  }
}
