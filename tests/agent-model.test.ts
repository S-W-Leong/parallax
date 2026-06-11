import { afterEach, describe, expect, it, vi } from "vitest";

const originalOpenAiModel = process.env.OPENAI_MODEL;

async function importAgentsWithModel(model: string | undefined) {
  vi.resetModules();

  if (model === undefined) {
    delete process.env.OPENAI_MODEL;
  } else {
    process.env.OPENAI_MODEL = model;
  }

  return import("@/lib/agent/agents");
}

describe("agent model configuration", () => {
  afterEach(() => {
    if (originalOpenAiModel === undefined) {
      delete process.env.OPENAI_MODEL;
    } else {
      process.env.OPENAI_MODEL = originalOpenAiModel;
    }

    vi.resetModules();
  });

  it("uses the cost-effective GPT mini model by default", async () => {
    const { makeGuideAgent, makeBuilderAgent, makeCriticAgent } = await importAgentsWithModel(undefined);

    expect(makeGuideAgent([]).model).toBe("gpt-5.4-mini");
    expect(makeBuilderAgent([]).model).toBe("gpt-5.4-mini");
    expect(makeCriticAgent([]).model).toBe("gpt-5.4-mini");
  });

  it("lets OPENAI_MODEL override the default model", async () => {
    const { makeGuideAgent } = await importAgentsWithModel("gpt-5.4-nano");

    expect(makeGuideAgent([]).model).toBe("gpt-5.4-nano");
  });
});
