import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { marked } from 'marked';
import { cn } from '../../utils/cn';

// @ts-ignore
const MarkdownComponents: import('react-markdown').Components = {
  p: ({ children, ...props }) => (
    <p className="mb-4 last:mb-0 leading-[1.7] break-words" {...props}>
      {children}
    </p>
  ),
  h1: ({ children, ...props }) => (
    <h1 className="text-[20px] font-semibold text-stone-900 mb-4 mt-6 first:mt-0 tracking-tight" {...props}>{children}</h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="text-[18px] font-semibold text-stone-900 mb-3 mt-5 first:mt-0 tracking-tight" {...props}>{children}</h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="text-[16px] font-medium text-stone-900 mb-3 mt-4 first:mt-0" {...props}>{children}</h3>
  ),
  ul: ({ children, ...props }) => (
    <ul className="list-disc list-outside ml-5 mb-4 space-y-1.5 marker:text-stone-400" {...props}>{children}</ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="list-decimal list-outside ml-5 mb-4 space-y-1.5 marker:text-stone-400" {...props}>{children}</ol>
  ),
  li: ({ children, ...props }) => (
    <li className="leading-[1.7] pl-1" {...props}>{children}</li>
  ),
  a: ({ href, children, ...props }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline hover:text-orange-700 underline-offset-2" {...props}>
      {children}
    </a>
  ),
  strong: ({ children, ...props }) => (
    <strong className="font-semibold text-stone-900" {...props}>{children}</strong>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote className="border-l-4 border-stone-200 pl-4 py-0.5 my-4 text-stone-500 italic bg-stone-50/50 rounded-r-lg" {...props}>
      {children}
    </blockquote>
  ),
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto mb-4 ring-1 ring-stone-200/60 rounded-xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
      <table className="w-full text-left border-collapse text-[14px]" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="bg-stone-50/80 border-b border-stone-200/80" {...props}>{children}</thead>
  ),
  tbody: ({ children, ...props }) => (
    <tbody className="divide-y divide-stone-100" {...props}>{children}</tbody>
  ),
  th: ({ children, ...props }) => (
    <th className="px-4 py-2.5 font-medium text-stone-700" {...props}>{children}</th>
  ),
  td: ({ children, ...props }) => (
    <td className="px-4 py-2.5 text-stone-600" {...props}>{children}</td>
  ),
  code: ({ node, inline, className, children, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';
    const isInline = !match;

    if (isInline) {
      return (
        <code className="px-1.5 py-0.5 mx-0.5 bg-stone-100/80 text-stone-700 rounded-[6px] text-[13.5px] font-mono border border-stone-200/50" {...props}>
          {children}
        </code>
      );
    }

    return (
      <div className="mb-4 mt-2 overflow-hidden rounded-[14px] bg-[#faf9f8] ring-1 ring-stone-200/60 shadow-sm text-[13px] group">
        <div className="flex items-center justify-between px-4 py-2 bg-stone-100/50 border-b border-stone-200/50">
          <span className="text-[11px] font-medium uppercase tracking-wider text-stone-500">{language || 'text'}</span>
        </div>
        <SyntaxHighlighter
          style={oneLight}
          language={language}
          PreTag="div"
          customStyle={{
            margin: 0,
            padding: '1rem',
            backgroundColor: 'transparent',
            fontSize: '13.5px',
            lineHeight: '1.6',
          }}
          {...props}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      </div>
    );
  }
};

const MarkdownBlock = memo(
  ({ content }: { content: string }) => {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={MarkdownComponents}
      >
        {content}
      </ReactMarkdown>
    );
  },
  (prevProps, nextProps) => prevProps.content === nextProps.content
);

export function MarkdownMessage({ content }: { content: string }) {
  const blocks = useMemo(() => {
    try {
      const tokens = marked.lexer(content);
      return tokens.map(token => token.raw);
    } catch (e) {
      // Fallback if marked fails to parse during streaming
      return [content];
    }
  }, [content]);

  return (
    <div className="text-[15px] text-stone-800 markdown-body">
      {blocks.map((block, index) => (
        <MarkdownBlock key={index} content={block} />
      ))}
    </div>
  );
}
