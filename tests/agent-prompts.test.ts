import { describe, expect, it } from "vitest";
import { BUILDER_AGENT_PROMPT, CRITIC_AGENT_PROMPT } from "@/lib/agent/prompts";

describe("agent prompts", () => {
  it("teaches the builder to offset runtime labels for dense or overlapping components", () => {
    expect(BUILDER_AGENT_PROMPT).toContain("Runtime labels are projected");
    expect(BUILDER_AGENT_PROMPT).toContain("bounding-box center");
    expect(BUILDER_AGENT_PROMPT).toContain("labelOffset");
    expect(BUILDER_AGENT_PROMPT).toContain('registerComponent("airflow", "Airflow", airflow, { labelOffset: [0, -0.45, 0] })');
  });

  it("asks the critic to reject likely runtime label overlap", () => {
    expect(CRITIC_AGENT_PROMPT).toContain("overlapping runtime labels");
    expect(CRITIC_AGENT_PROMPT).toContain("labelOffset");
  });

  it("keeps the critic focused on fast blocker-only review", () => {
    expect(CRITIC_AGENT_PROMPT).toContain("fast QA pass");
    expect(CRITIC_AGENT_PROMPT).toContain("Approve by default");
    expect(CRITIC_AGENT_PROMPT).toContain("Block only");
  });
});
