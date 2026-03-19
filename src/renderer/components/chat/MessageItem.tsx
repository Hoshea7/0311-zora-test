import { memo, useState, type ReactNode } from "react";
import type { ConversationMessage, FileAttachment } from "../../types";
import { formatFileSize } from "../../utils/format";
import { cn } from "../../utils/cn";
import { CopyButton, MarkdownMessage } from "./MarkdownMessage";

export interface MessageItemProps {
  message: ConversationMessage;
  showAvatar?: boolean;
  showCopyButton?: boolean;
  processContent?: ReactNode;
  toolOpen?: boolean;
  onToolToggle?: (messageId: string) => void;
}

function ZoraAvatar() {
  return (
    <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-md bg-orange-500 text-white shadow-sm">
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
    </div>
  );
}

function ProcessBlock({
  icon,
  title,
  isStreaming,
  isOpen,
  onToggle,
  children,
}: {
  icon: ReactNode;
  title: ReactNode;
  isStreaming?: boolean;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="group/block relative mb-0.5 mt-0.5 w-full max-w-full">
      <button
        type="button"
        className="group flex w-fit cursor-pointer items-center justify-between gap-6 py-1 text-[13.5px] text-stone-500 transition-colors hover:text-stone-800"
        onClick={onToggle}
      >
        <div className="flex items-center gap-1.5 overflow-hidden">
          <span className="flex h-3 w-3 shrink-0 items-center justify-center text-stone-400 transition-colors group-hover:text-stone-500">
            {icon}
          </span>
          <span className="flex items-center gap-1.5 truncate leading-none">{title}</span>
          {isStreaming ? (
            <span className="ml-1 flex h-1.5 w-1.5 items-center justify-center shrink-0">
              <span className="absolute inline-flex h-1.5 w-1.5 animate-ping rounded-full bg-stone-400 opacity-75" />
              <span className="relative inline-flex h-1 w-1 rounded-full bg-stone-500" />
            </span>
          ) : null}
        </div>
        <svg
          className={cn(
            "ml-1 h-3.5 w-3.5 shrink-0 transition-all group-hover:opacity-60",
            isOpen ? "rotate-90 opacity-40" : "opacity-0"
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {isOpen ? <div className="mt-1 pl-[18px] pr-4">{children}</div> : null}
    </div>
  );
}

export function ThinkingTrace({
  content,
  isStreaming,
}: {
  content: string;
  isStreaming: boolean;
}) {
  const [isOpen, setIsOpen] = useState(isStreaming);

  return (
    <ProcessBlock
      icon={<span className="mb-0.5 text-[10px] leading-none">●</span>}
      title={isStreaming ? "思考中..." : "思考过程"}
      isStreaming={isStreaming}
      isOpen={isOpen}
      onToggle={() => setIsOpen((current) => !current)}
    >
      <div className="text-[13.5px] leading-relaxed text-stone-500">
        <pre className="m-0 whitespace-pre-wrap font-sans">{content}</pre>
      </div>
    </ProcessBlock>
  );
}

type ToolCardMessage = ConversationMessage & {
  turn: NonNullable<ConversationMessage["turn"]>;
};

export function ToolCard({
  message,
  isOpen,
  onToggleGroup,
}: {
  message: ToolCardMessage;
  isOpen: boolean;
  onToggleGroup?: (messageId: string) => void;
}) {
  const lastToolStep = [...message.turn.processSteps]
    .reverse()
    .find((step) => step.type === "tool");
  const tool = lastToolStep?.type === "tool" ? lastToolStep.tool : null;

  if (!tool) {
    return null;
  }

  return (
    <ProcessBlock
      icon={<span className="text-[10px] leading-none">◌</span>}
      title={tool.name}
      isStreaming={tool.status === "running"}
      isOpen={isOpen}
      onToggle={() => onToggleGroup?.(message.id)}
    >
      <div className="flex flex-col gap-4 rounded-lg border border-stone-100 bg-stone-50 px-4 py-3 shadow-inner">
        <div className="flex flex-col gap-1.5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-stone-400">
            Input
          </div>
          <pre className="m-0 whitespace-pre-wrap break-words font-mono text-[11.5px] text-stone-600">
            {tool.input || "Waiting..."}
          </pre>
        </div>
        {tool.result || tool.status !== "running" ? (
          <div className="flex flex-col gap-1.5">
            <div className="text-[11px] font-medium uppercase tracking-wider text-stone-400">
              Output
            </div>
            <pre
              className={cn(
                "m-0 whitespace-pre-wrap break-words font-mono text-[11.5px]",
                tool.status === "error" ? "text-rose-600" : "text-stone-600"
              )}
            >
              {tool.result || (tool.status === "error" ? "The tool returned an error." : "No output.")}
            </pre>
          </div>
        ) : null}
      </div>
    </ProcessBlock>
  );
}

function MessageAttachments({ attachments }: { attachments: FileAttachment[] }) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="flex w-full max-w-[280px] flex-col gap-2">
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="flex w-full items-center gap-3.5 rounded-2xl bg-[#EBE4DC] p-2 pr-4 transition-all"
          title={attachment.name}
        >
          <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-white shadow-sm ring-1 ring-inset ring-black/5">
            {attachment.category === "image" && attachment.base64Data ? (
              <img
                src={`data:${attachment.mimeType};base64,${attachment.base64Data}`}
                alt={attachment.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="text-stone-400">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-6 w-6"
                >
                  <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
                  <path d="M14 2v5h5" />
                  <path d="M9 13h6M9 17h6M9 9h1" />
                </svg>
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-col justify-center">
            <div className="truncate text-[14px] font-medium leading-snug text-stone-900">
              {attachment.name}
            </div>
            <div className="mt-0.5 text-[12px] leading-tight text-stone-500">
              {formatFileSize(attachment.size)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export const MessageItem = memo(function MessageItem({
  message,
  showAvatar = true,
  showCopyButton = true,
  processContent,
}: MessageItemProps) {
  const isUser = message.role === "user";
  const turn = message.turn;
  const isStreaming = turn?.status === "streaming";
  const copyContent = turn?.bodySegments.map((segment) => segment.text).join("\n\n").trim() ?? "";

  if (isUser) {
    const hasAttachments = Boolean(message.attachments?.length);

    return (
      <article className="ml-auto mt-6 flex max-w-[85%] flex-col items-end gap-1">
        {hasAttachments ? <MessageAttachments attachments={message.attachments!} /> : null}
        {message.text ? (
          <div className="max-w-full rounded-[24px] rounded-tr-[8px] bg-[#f0e8dc] px-4 py-3 text-stone-900 shadow-sm transition-all">
            <div className="whitespace-pre-wrap text-[15px] font-normal leading-[1.6]">
              {message.text}
            </div>
          </div>
        ) : null}
      </article>
    );
  }

  const hasThinking = Boolean(
    turn?.processSteps.some(
      (step) => step.type === "thinking" && step.thinking.content.trim().length > 0
    )
  );
  const thinkingText =
    turn?.processSteps.reduce<string[]>((parts, step) => {
      if (step.type === "thinking" && step.thinking.content.trim().length > 0) {
        parts.push(step.thinking.content);
      }
      return parts;
    }, []).join("\n\n") ?? "";

  return (
    <article className="group mr-auto mt-8 flex w-full max-w-[95%] items-start gap-4">
      <div className="mt-1 flex w-8 shrink-0 justify-center transition-opacity">
        {showAvatar ? <ZoraAvatar /> : null}
      </div>

      <div className="w-full max-w-full flex-1 overflow-hidden">
        {showAvatar ? (
          <div className="mb-2 mt-0.5 flex items-center gap-2">
            <span className="text-[14px] font-semibold tracking-tight text-stone-800">Zora</span>
          </div>
        ) : null}

        {processContent ? <div className="mb-3">{processContent}</div> : null}

        {hasThinking ? (
          <ThinkingTrace content={thinkingText} isStreaming={Boolean(isStreaming && !copyContent)} />
        ) : null}

        {copyContent ? (
          <div className={cn("break-words text-[15px] leading-[1.6] text-stone-800", hasThinking ? "mt-3" : "mt-0")}>
            <MarkdownMessage content={copyContent} />
            {isStreaming ? (
              <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-stone-300 align-middle" />
            ) : null}
            {showCopyButton ? (
              <div className="mt-3 flex justify-start opacity-0 transition-opacity group-hover:opacity-100">
                <CopyButton
                  content={copyContent}
                  className="h-8 w-8 rounded-md text-stone-400 hover:text-stone-700"
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {turn?.error ? (
          <div className="mt-3 rounded-xl bg-rose-50/80 px-4 py-3 text-[14px] leading-relaxed text-rose-800 ring-1 ring-rose-200/50">
            {turn.error}
          </div>
        ) : null}
      </div>
    </article>
  );
});
