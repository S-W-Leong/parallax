import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatThread } from "@/components/chat/ChatThread";

describe("ChatThread", () => {
  it("renders streamed agent trace entries under assistant messages", () => {
    const html = renderToStaticMarkup(
      <ChatThread
        messages={[
          {
            id: "message-1",
            role: "assistant",
            content: "Thinking...",
            createdAt: "2026-06-10T03:00:00.000Z",
            status: "streaming",
            agentTrace: [
              { kind: "reasoning", label: "Reasoning through next step" },
              { kind: "tool", label: "Calling create_experience", detail: "Executing tool" },
            ],
          },
        ]}
        artifacts={{}}
        trace={[]}
        onEnterExperience={() => undefined}
      />,
    );

    expect(html).toContain("Reasoning through next step");
    expect(html).toContain("Calling create_experience");
    expect(html).toContain("Executing tool");
    expect(html.indexOf("Reasoning through next step")).toBeLessThan(html.indexOf("Thinking..."));
  });
});
