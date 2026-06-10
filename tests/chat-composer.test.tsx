import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatComposer } from "@/components/chat/ChatComposer";

describe("ChatComposer", () => {
  it("renders a push-to-talk control beside the text input", () => {
    const html = renderToStaticMarkup(
      <ChatComposer placeholder="Ask a question" onSubmit={vi.fn()} />,
    );

    expect(html).toContain('class="icon-button push-to-talk-button"');
    expect(html).toContain('aria-label="Hold to dictate message"');
  });
});
