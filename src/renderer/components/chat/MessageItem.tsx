import { useState } from "react";
import { useAtom } from "jotai";
import type { ChatMessage } from "../../types";
import { cn } from "../../utils/cn";
import { globalThinkingExpandedAtom, globalToolExpandedAtom } from "../../store/ui";

export interface MessageItemProps {
  message: ChatMessage;
  showAvatar?: boolean;
}

// Zora Avatar Icon
function ZoraAvatar() {
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-100/80 text-orange-600 shadow-sm ring-1 ring-orange-200/50">
      <svg
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
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

// Shared Process Block wrapper
function ProcessBlock({
  icon,
  title,
  isStreaming,
  isOpen,
  onToggle,
  children
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  isStreaming?: boolean;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2 mt-1 overflow-hidden rounded-[14px] bg-stone-50/80 text-stone-700 ring-1 ring-stone-200/50 transition-all w-fit min-w-[200px] max-w-full">
      <div 
        className="flex cursor-pointer items-center justify-between gap-6 px-3.5 py-2 text-[13px] font-medium text-stone-500 hover:bg-stone-100/80 hover:text-stone-700 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="shrink-0">{icon}</span>
          <span className="truncate">{title}</span>
          {isStreaming && (
            <span className="flex h-2 w-2 items-center justify-center shrink-0 ml-1">
              <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-stone-400 opacity-75"></span>
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-stone-500"></span>
            </span>
          )}
        </div>
        <svg 
          className={cn("h-3.5 w-3.5 opacity-60 transition-transform shrink-0", isOpen ? "rotate-90" : "")} 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
      
      {isOpen && (
        <div className="border-t border-stone-200/40 px-3.5 pb-3.5 pt-2.5 max-h-[400px] overflow-y-auto custom-scrollbar">
          {children}
        </div>
      )}
    </div>
  );
}

function ThinkingTrace({ content, isStreaming }: { content: string, isStreaming: boolean }) {
  const [globalExpanded, setGlobalExpanded] = useAtom(globalThinkingExpandedAtom);
  // Use global preference on mount to remember user's last action
  const [isOpen, setIsOpen] = useState(globalExpanded);

  const handleToggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    setGlobalExpanded(next); // remember preference
  };

  return (
    <ProcessBlock
      icon="●"
      title={isStreaming ? "思考中..." : "思考过程"}
      isStreaming={isStreaming}
      isOpen={isOpen}
      onToggle={handleToggle}
    >
      <div className="text-[13.5px] leading-relaxed text-stone-500">
        <pre className="m-0 whitespace-pre-wrap font-sans">{content}</pre>
      </div>
    </ProcessBlock>
  );
}

function ToolCard({ message }: { message: ChatMessage }) {
  const [globalExpanded, setGlobalExpanded] = useAtom(globalToolExpandedAtom);
  // Use global preference on mount to remember user's last action
  const [isOpen, setIsOpen] = useState(globalExpanded);
  
  const isInputStreaming = message.status === "streaming";
  const isToolRunning = message.toolStatus === "running";
  const isToolError = message.toolStatus === "error";

  const handleToggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    setGlobalExpanded(next); // remember preference
  };

  // Generate a brief summary for the collapsed state
  let summary = "";
  if (message.toolInput) {
    try {
      const parsed = JSON.parse(message.toolInput);
      const toolName = message.toolName || "";
      if (toolName.includes("bash")) {
        summary = parsed.command;
      } else if (toolName.includes("read") || toolName.includes("write")) {
        summary = parsed.filePath ? parsed.filePath.split('/').pop() : "";
      } else if (toolName.includes("search")) {
        summary = parsed.query || parsed.pattern || "";
      } else {
        const val = Object.values(parsed).find(v => typeof v === 'string' && v.trim().length > 0);
        summary = val ? String(val) : "";
      }
    } catch {
      // JSON hasn't finished streaming, use raw text safely
      const cleanRaw = message.toolInput.replace(/["'{}]/g, "").trim();
      summary = cleanRaw;
    }
  }
  
  if (!summary) summary = "等待参数...";
  if (summary.length > 30) summary = summary.slice(0, 30) + "...";

  const cleanToolName = message.toolName?.replace('default_api:', '') || 'Tool';
  const displayTitle = `${cleanToolName} · ${summary}`;

  return (
    <ProcessBlock
      icon={<span className="text-stone-400">⚙</span>}
      title={displayTitle}
      isStreaming={isToolRunning || isInputStreaming}
      isOpen={isOpen}
      onToggle={handleToggle}
    >
      <div className="flex flex-col gap-2.5">
        {/* Input parameters */}
        <div className="flex flex-col gap-1.5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-stone-400">
            Input
          </div>
          <div className="rounded-lg bg-stone-100/50 px-3 py-2 text-[12px] leading-relaxed text-stone-600 ring-1 ring-stone-900/5">
            <pre className="m-0 whitespace-pre-wrap break-words font-mono text-[11.5px]">
              {message.toolInput || "Waiting..."}
              {isInputStreaming ? (
                <span className="ml-[2px] inline-block animate-pulse text-stone-400">|</span>
              ) : null}
            </pre>
          </div>
        </div>

        {/* Output results */}
        {(message.toolResult || isToolError || (!isToolRunning && !message.toolResult)) && (
          <div className="flex flex-col gap-1.5 mt-1">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-stone-400">
              Output
              {isToolError && <span className="text-rose-500 lowercase normal-case tracking-normal">Failed</span>}
            </div>
            <div className={cn(
              "rounded-lg px-3 py-2 text-[12px] leading-relaxed ring-1",
              isToolError 
                ? "bg-rose-50/50 text-rose-700 ring-rose-200/50" 
                : "bg-white text-stone-600 ring-stone-200/60"
            )}>
              <pre className="m-0 whitespace-pre-wrap break-words font-mono text-[11.5px]">
                {message.toolResult || (isToolError ? "The tool returned an error." : "No output.")}
              </pre>
            </div>
          </div>
        )}
      </div>
    </ProcessBlock>
  );
}

/**
 * 单条消息组件
 * 渲染用户或助手的消息，包括思考内容和错误信息
 */
export function MessageItem({ message, showAvatar = true }: MessageItemProps) {
  const isUser = message.role === "user";
  const isThinkingMessage = message.type === "thinking" || Boolean(message.thinking);
  const isToolUse = message.type === "tool_use";
  
  // Using status === "streaming" handles both thinking and text streaming
  const isStreaming = message.status === "streaming";
  const hasText = Boolean(message.text);

  // For User Message
  if (isUser) {
    return (
      <article className="ml-auto mt-6 flex max-w-[80%] flex-col items-end">
        <div className="rounded-[24px] rounded-tr-[8px] bg-[#e6e2da] px-5 py-3 text-stone-900 shadow-[0_2px_4px_rgba(0,0,0,0.02)] transition-all">
          <div className="whitespace-pre-wrap text-[15px] leading-relaxed font-normal">
            {message.text}
          </div>
        </div>
      </article>
    );
  }

  // For Agent Message (Tool, Thinking, or Text)
  // Tool rendering check
  if (isToolUse) {
    return (
      <article className={cn("mr-auto flex w-full max-w-[90%] items-start gap-3.5 group", showAvatar ? "mt-6" : "mt-1")}>
        <div className="mt-1 shrink-0 w-7 flex justify-center transition-opacity">
          {showAvatar ? <ZoraAvatar /> : null}
        </div>
        
        <div className="flex-1 overflow-hidden pt-1 w-full max-w-full">
          <ToolCard message={message} />
        </div>
      </article>
    );
  }

  return (
    <article className={cn("mr-auto flex w-full max-w-[90%] items-start gap-3.5 group", showAvatar ? "mt-6" : "mt-1")}>
      <div className="mt-1 shrink-0 w-7 flex justify-center transition-opacity">
        {showAvatar ? <ZoraAvatar /> : null}
      </div>
      
      <div className="flex-1 overflow-hidden pt-1 w-full max-w-full">
        {isThinkingMessage ? (
          <ThinkingTrace 
            content={message.thinking} 
            // the trace is streaming only if we have no text yet AND the message overall is streaming
            isStreaming={isStreaming && !hasText} 
          />
        ) : null}

        {hasText ? (
          <div className={cn("whitespace-pre-wrap text-[15px] leading-relaxed text-stone-800 break-words", (showAvatar || isThinkingMessage) ? "mt-1" : "mt-0")}>
            {message.text}
            {isStreaming && (
              <span className="ml-1 inline-block h-3.5 w-1.5 animate-pulse bg-stone-300 align-middle"></span>
            )}
          </div>
        ) : null}

        {!isThinkingMessage && !hasText && isStreaming ? (
          <div className="mt-2 flex items-center gap-1.5 text-[15px] text-stone-400">
            <span className="flex h-1.5 w-1.5 items-center justify-center">
              <span className="absolute inline-flex h-1.5 w-1.5 animate-ping rounded-full bg-stone-300 opacity-75"></span>
              <span className="relative inline-flex h-1 w-1 rounded-full bg-stone-400"></span>
            </span>
          </div>
        ) : null}

        {message.error ? (
          <div className="mt-3 rounded-xl bg-rose-50/80 px-4 py-3 text-[14px] leading-relaxed text-rose-800 ring-1 ring-rose-200/50">
            {message.error}
          </div>
        ) : null}
      </div>
    </article>
  );
}
