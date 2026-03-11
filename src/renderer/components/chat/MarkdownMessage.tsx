import { memo, useMemo, type ComponentPropsWithoutRef, type CSSProperties } from "react";
import { marked } from "marked";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { cn } from "../../utils/cn";

type MarkdownMessageProps = {
  content: string;
};

type MarkdownCodeProps = ComponentPropsWithoutRef<"code"> & {
  inline?: boolean;
  node?: unknown;
};

const syntaxTheme: { [key: string]: CSSProperties } = {
  ...(oneLight as { [key: string]: CSSProperties }),
  'pre[class*="language-"]': {
    ...oneLight['pre[class*="language-"]'],
    background: "transparent",
    margin: 0,
    padding: 0
  },
  'code[class*="language-"]': {
    ...oneLight['code[class*="language-"]'],
    background: "transparent"
  }
} as const;

const markdownComponents: Components = {
  h1: ({ children, ...props }) => (
    <h1
      className="mb-4 mt-8 text-[24px] font-semibold tracking-[-0.03em] text-stone-900 first:mt-0"
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2
      className="mb-3 mt-7 text-[20px] font-semibold tracking-[-0.02em] text-stone-900 first:mt-0"
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3
      className="mb-3 mt-6 text-[17px] font-semibold text-stone-900 first:mt-0"
      {...props}
    >
      {children}
    </h3>
  ),
  p: ({ children, ...props }) => (
    <p className="mb-4 leading-[1.78] text-stone-700 last:mb-0" {...props}>
      {children}
    </p>
  ),
  ul: ({ children, className, ...props }) => (
    <ul
      className={cn(
        "mb-4 ml-5 list-disc space-y-2 marker:text-orange-300",
        className?.includes("contains-task-list") ? "ml-0 list-none space-y-2.5" : ""
      )}
      {...props}
    >
      {children}
    </ul>
  ),
  ol: ({ children, className, ...props }) => (
    <ol
      className={cn(
        "mb-4 ml-5 list-decimal space-y-2 marker:font-medium marker:text-orange-400",
        className?.includes("contains-task-list") ? "ml-0 list-none space-y-2.5" : ""
      )}
      {...props}
    >
      {children}
    </ol>
  ),
  li: ({ children, className, ...props }) => (
    <li
      className={cn(
        "pl-1 leading-[1.72] text-stone-700 [&>p]:mb-0",
        className?.includes("task-list-item") ? "list-none pl-0" : ""
      )}
      {...props}
    >
      {children}
    </li>
  ),
  a: ({ href, children, ...props }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-orange-700 underline decoration-orange-200 underline-offset-[0.22em] transition-colors hover:text-orange-800 hover:decoration-orange-400"
      {...props}
    >
      {children}
    </a>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="my-5 rounded-r-[18px] border-l-[3px] border-orange-300/80 bg-[#fbf5ee] px-4 py-3 text-stone-600"
      {...props}
    >
      {children}
    </blockquote>
  ),
  hr: (props) => <hr className="my-6 border-0 border-t border-stone-200/80" {...props} />,
  strong: ({ children, ...props }) => (
    <strong className="font-semibold text-stone-900" {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }) => (
    <em className="text-stone-700/95" {...props}>
      {children}
    </em>
  ),
  table: ({ children, ...props }) => (
    <div className="my-5 overflow-x-auto rounded-[18px] border border-stone-200/80 bg-[#fffdfa] shadow-[0_1px_0_rgba(120,53,15,0.03)]">
      <table className="min-w-full border-collapse text-left text-[14px]" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="bg-[#f8efe3] text-stone-700" {...props}>
      {children}
    </thead>
  ),
  tbody: ({ children, ...props }) => (
    <tbody className="[&>tr:nth-child(even)]:bg-[#fcf7f0]" {...props}>
      {children}
    </tbody>
  ),
  tr: ({ children, ...props }) => (
    <tr className="border-b border-stone-200/70 last:border-b-0" {...props}>
      {children}
    </tr>
  ),
  th: ({ children, ...props }) => (
    <th className="px-4 py-3 font-semibold text-stone-700" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="px-4 py-3 align-top text-stone-600" {...props}>
      {children}
    </td>
  ),
  input: ({ type, checked, ...props }) =>
    type === "checkbox" ? (
      <input
        type="checkbox"
        checked={checked}
        disabled
        readOnly
        className="mr-2 h-3.5 w-3.5 translate-y-[1px] accent-orange-500"
        {...props}
      />
    ) : (
      <input type={type} checked={checked} {...props} />
    ),
  pre: ({ children }) => children,
  code: ({ inline, className, children, node: _node, ...props }: MarkdownCodeProps) => {
    const match = /language-([\w-]+)/.exec(className || "");
    const language = match?.[1];
    const code = String(children).replace(/\n$/, "");

    if (inline || !language) {
      return (
        <code
          className="rounded-[8px] border border-stone-200/80 bg-[#f5eee4] px-1.5 py-0.5 font-mono text-[13px] text-stone-700"
          {...props}
        >
          {children}
        </code>
      );
    }

    return (
      <div className="my-5 overflow-hidden rounded-[20px] border border-stone-200/80 bg-[#fffaf3] shadow-[0_8px_24px_rgba(120,53,15,0.06)]">
        <div className="flex items-center justify-between border-b border-stone-200/70 bg-[#f6ebdc] px-4 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
            {language}
          </span>
        </div>
        <SyntaxHighlighter
          language={language}
          style={syntaxTheme}
          PreTag="div"
          customStyle={
            {
              margin: 0,
              padding: "1rem 1rem 1.05rem",
              backgroundColor: "transparent",
              fontSize: "13.5px",
              lineHeight: 1.65
            } satisfies CSSProperties
          }
          codeTagProps={{
            style: {
              fontFamily:
                '"SFMono-Regular", "SF Mono", "Cascadia Code", "JetBrains Mono", Consolas, monospace'
            }
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    );
  }
};

const MarkdownBlock = memo(
  function MarkdownBlock({ block }: { block: string }) {
    return (
      <div style={{ contentVisibility: "auto" }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {block}
        </ReactMarkdown>
      </div>
    );
  },
  (prevProps, nextProps) => prevProps.block === nextProps.block
);

function splitMarkdownIntoBlocks(content: string) {
  if (!content.trim()) {
    return [];
  }

  try {
    const tokens = marked.lexer(content, { gfm: true });
    const blocks = tokens
      .filter((token) => token.type !== "space" && token.raw.trim().length > 0)
      .map((token) => token.raw);

    return blocks.length > 0 ? blocks : [content];
  } catch {
    return [content];
  }
}

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  const blocks = useMemo(() => splitMarkdownIntoBlocks(content), [content]);

  return (
    <div className="min-w-0 text-[15px] text-stone-800">
      {blocks.map((block, index) => (
        <MarkdownBlock key={index} block={block} />
      ))}
    </div>
  );
}
