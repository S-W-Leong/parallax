import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatHome } from "@/components/app/ChatHome";

const handlers = {
  onSendMessage: () => undefined,
  onStop: () => undefined,
  onEnterExperience: () => undefined,
};

describe("ChatHome", () => {
  it("renders ambient visuals only for the empty chat state", () => {
    const emptyHtml = renderToStaticMarkup(
      <ChatHome messages={[]} artifacts={{}} trace={[]} busy={false} {...handlers} />,
    );
    const activeHtml = renderToStaticMarkup(
      <ChatHome
        messages={[
          {
            id: "message-1",
            role: "user",
            content: "Explain fusion",
            createdAt: "2026-06-10T03:00:00.000Z",
          },
        ]}
        artifacts={{}}
        trace={[]}
        busy={false}
        {...handlers}
      />,
    );

    expect(emptyHtml).toContain('aria-hidden="true"');
    expect(emptyHtml).toContain("ambient-field");
    expect(activeHtml).not.toContain("ambient-field");
  });
});
