import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownMessage, normalizeMathDelimiters } from "@/components/chat/MarkdownMessage";

describe("MarkdownMessage", () => {
  it("renders markdown and latex-delimited math", () => {
    const html = renderToStaticMarkup(
      <MarkdownMessage
        content={
          "I built an interactive **Elastic Potential Energy Explorer**.\n\n" +
          "You can explore:\n" +
          "- a spring-mass system,\n" +
          "- compressed vs. stretched states,\n" +
          "- and an energy bar showing **\\( U = \\tfrac{1}{2}kx^2 \\)** visually.\n\n" +
          "\\[ U = \\frac{1}{2}kx^2 \\]"
        }
      />,
    );

    expect(html).toContain("<strong>Elastic Potential Energy Explorer</strong>");
    expect(html).toContain("<li>a spring-mass system,</li>");
    expect(html).toContain("katex");
    expect(html).not.toContain("**");
    expect(html).not.toContain("\\(");
    expect(html).not.toContain("\\[");
  });

  it("normalizes common latex delimiters for remark math", () => {
    expect(normalizeMathDelimiters("\\( E = mc^2 \\)\n\\[ F = ma \\]")).toBe("$ E = mc^2 $\n\n$$\n F = ma \n$$\n");
  });
});
