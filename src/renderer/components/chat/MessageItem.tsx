import type { ChatMessage } from "../../types";
import { cn } from "../../utils/cn";

export interface MessageItemProps {
  message: ChatMessage;
}

function MessageHeader({ message }: MessageItemProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-current/60">
        {message.role === "user" ? "You" : "Agent"}
      </div>
      {message.role === "assistant" && message.status === "streaming" ? (
        <div className="flex items-center gap-2 text-[0.68rem] uppercase tracking-[0.2em] text-amber-700">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-600" />
          Live
        </div>
      ) : null}
    </div>
  );
}

function ThinkingTrace({ content }: { content: string }) {
  return (
    <details className="mt-4 overflow-hidden rounded-[18px] border border-stone-900/8 bg-stone-200/65 text-stone-700">
      <summary className="cursor-pointer list-none px-4 py-3 text-xs font-semibold uppercase tracking-[0.22em]">
        Thinking Trace
      </summary>
      <div className="border-t border-stone-900/8 px-4 py-3 text-sm leading-7 text-stone-700">
        <pre className="m-0 whitespace-pre-wrap font-inherit">{content}</pre>
      </div>
    </details>
  );
}

function ToolCard({ message }: MessageItemProps) {
  const isInputStreaming = message.status === "streaming";
  const isToolRunning = message.toolStatus === "running";
  const isToolError = message.toolStatus === "error";

  return (
    <article className="mr-auto flex max-w-[92%] overflow-hidden rounded-[28px] border border-amber-300/60 bg-[linear-gradient(180deg,_rgba(255,251,235,0.96)_0%,_rgba(254,243,199,0.9)_100%)] shadow-[0_20px_55px_rgba(120,72,24,0.12)]">
      <div className="w-1.5 bg-[linear-gradient(180deg,_rgba(251,191,36,0.95)_0%,_rgba(249,115,22,0.92)_100%)]" />
      <div className="flex-1 px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-stone-600">
              Agent Tool
            </div>
            <div className="mt-2 text-base font-semibold text-stone-900 sm:text-[1.02rem]">
              {`🔧 ${message.toolName ?? "Tool"}`}
            </div>
            {message.toolUseId ? (
              <div className="mt-1 text-[0.68rem] uppercase tracking-[0.18em] text-stone-500">
                {message.toolUseId}
              </div>
            ) : null}
          </div>

          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em]",
              isToolError
                ? "bg-orange-100 text-orange-800"
                : isToolRunning
                  ? "bg-amber-100 text-amber-800"
                  : "bg-stone-200/80 text-stone-700"
            )}
          >
            {isToolRunning ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-500/35 border-t-amber-700" />
            ) : null}
            {isToolError ? "Error" : isToolRunning ? "Running" : "Done"}
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <section>
            <div className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-600">
              Input
            </div>
            <div className="mt-2 rounded-[18px] border border-stone-950/8 bg-stone-950 px-4 py-3 text-[0.82rem] leading-6 text-stone-100 shadow-inner">
              <pre className="m-0 whitespace-pre-wrap break-words font-mono">
                {message.toolInput || "Waiting for tool input..."}
                {isInputStreaming ? (
                  <span className="ml-0.5 inline-block animate-pulse text-amber-300">
                    |
                  </span>
                ) : null}
              </pre>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-600">
              Output
              {isToolRunning ? (
                <span className="inline-flex items-center gap-1.5 text-amber-700">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-500/35 border-t-amber-700" />
                  Waiting
                </span>
              ) : null}
            </div>
            <div className="mt-2 rounded-[18px] border border-stone-950/8 bg-stone-900 px-4 py-3 text-[0.82rem] leading-6 text-stone-100 shadow-inner">
              <pre className="m-0 whitespace-pre-wrap break-words font-mono">
                {message.toolResult ||
                  (isToolError
                    ? "The tool returned an error."
                    : "Waiting for tool result...")}
              </pre>
            </div>
          </section>
        </div>

        {message.error ? (
          <div className="mt-4 rounded-2xl border border-orange-900/10 bg-orange-50 px-4 py-3 text-sm leading-6 text-orange-900">
            {message.error}
          </div>
        ) : null}
      </div>
    </article>
  );
}

/**
 * 单条消息组件
 * 渲染用户或助手的消息，包括思考内容和错误信息
 */
export function MessageItem({ message }: MessageItemProps) {
  if (message.type === "tool_use") {
    return <ToolCard message={message} />;
  }

  const isThinkingMessage = message.type === "thinking" || Boolean(message.thinking);

  return (
    <article
      className={cn(
        "rounded-[26px] px-4 py-4 shadow-[0_16px_45px_rgba(70,40,20,0.06)] sm:px-5",
        message.role === "user"
          ? "ml-auto max-w-[85%] border border-stone-900/8 bg-stone-950 text-stone-50"
          : "mr-auto max-w-[90%] border border-stone-900/8 bg-white/85 text-stone-900"
      )}
    >
      <MessageHeader message={message} />

      {isThinkingMessage ? (
        <ThinkingTrace content={message.thinking} />
      ) : null}

      {message.text ? (
        <div className="mt-4 whitespace-pre-wrap text-sm leading-7 sm:text-[0.96rem]">
          {message.text}
        </div>
      ) : null}

      {!isThinkingMessage && !message.text ? (
        <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-stone-500 sm:text-[0.96rem]">
          Waiting for the first token...
        </div>
      ) : null}

      {message.error ? (
        <div className="mt-4 rounded-2xl border border-rose-900/10 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900">
          {message.error}
        </div>
      ) : null}
    </article>
  );
}
