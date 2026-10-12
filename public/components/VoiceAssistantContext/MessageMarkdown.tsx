import React from "react";

import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/** Compact styles for chat bubbles (the project has no typography plugin). */
const COMPONENTS: Components = {
  p: ({ children }) => <p className="
    mb-2
    last:mb-0
  ">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="
      text-mist-300 underline
    ">
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="
    mb-2 list-disc pl-5
    last:mb-0
  ">{children}</ul>,
  ol: ({ children }) => <ol className="
    mb-2 list-decimal pl-5
    last:mb-0
  ">{children}</ol>,
  li: ({ children }) => <li className="mb-0.5">{children}</li>,
  h1: ({ children }) => <p className="mb-1 font-semibold">{children}</p>,
  h2: ({ children }) => <p className="mb-1 font-semibold">{children}</p>,
  h3: ({ children }) => <p className="mb-1 font-semibold">{children}</p>,
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-mist-600 pl-2 text-mist-300">{children}</blockquote>
  ),
  code: ({ children, className }) =>
    className ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded-sm bg-gray-950 px-1 py-0.5 text-[0.85em]">{children}</code>
    ),
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded-md bg-gray-950 p-2 text-xs">{children}</pre>
  ),
  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto">
      <table className="text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-gray-600 px-2 py-1 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="border-b border-gray-700 px-2 py-1">{children}</td>,
};

/**
 * Renders a reply's markdown. Raw HTML is never rendered, and images are
 * dropped: the conversation's own images come from the bucket, while a URL
 * written by the model could load anything.
 */
export function MessageMarkdown({ text }: { text: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={COMPONENTS}
      disallowedElements={["img"]}
      unwrapDisallowed
    >
      {text}
    </Markdown>
  );
}
