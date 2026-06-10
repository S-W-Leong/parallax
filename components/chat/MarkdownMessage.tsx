"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

type MarkdownMessageProps = {
  content: string;
};

const components: Components = {
  a: ({ children, ...props }) => (
    <a {...props} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
};

export function normalizeMathDelimiters(content: string) {
  return content
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, math: string) => `\n$$\n${math}\n$$\n`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, math: string) => `$${math}$`);
}

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <div className="markdown-message">
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[[rehypeKatex, { throwOnError: false }]]} components={components}>
        {normalizeMathDelimiters(content)}
      </ReactMarkdown>
    </div>
  );
}
