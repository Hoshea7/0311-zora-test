import { useRef, useEffect } from "react";
import { useAtom } from "jotai";
import { messagesAtom, isAgentIdleAtom, isRunningAtom } from "../../store/chat";
import { MessageItem } from "./MessageItem";
import { EmptyState } from "./EmptyState";

function PendingAssistantRow({ showDots }: { showDots: boolean }) {
  return (
    <div className="mr-auto mt-8 flex w-full max-w-[95%] items-start gap-4">
      <div className="mt-1 flex w-8 shrink-0 justify-center">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm ring-1 ring-blue-600/50">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="mb-2 mt-0.5 flex items-center gap-2">
          <span className="text-[14px] font-semibold tracking-tight text-stone-800">Zora</span>
          <span className="mt-[2px] text-[11px] font-medium text-stone-400">
            {new Date().toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false
            })}
          </span>
        </div>

        {showDots ? (
          <div className="mt-1 flex h-6 items-center gap-1.5">
            <div
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-300"
              style={{ animationDelay: "0ms", animationDuration: "1s" }}
            />
            <div
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-300"
              style={{ animationDelay: "150ms", animationDuration: "1s" }}
            />
            <div
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-300"
              style={{ animationDelay: "300ms", animationDuration: "1s" }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * 消息列表组件
 * 显示所有消息并自动滚动到底部
 */
export function MessageList() {
  const [messages] = useAtom(messagesAtom);
  const [isAgentIdle] = useAtom(isAgentIdleAtom);
  const [isRunning] = useAtom(isRunningAtom);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);

  const lastUserIndex = messages.reduce((acc, message, index) => {
    if (message.role === "user") {
      return index;
    }
    return acc;
  }, -1);

  const hasAssistantInCurrentTurn =
    lastUserIndex >= 0 &&
    messages.slice(lastUserIndex + 1).some((message) => message.role === "assistant");

  // 自动滚动到底部
  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({
      behavior: isRunning ? "auto" : "smooth",
      block: "end"
    });
  }, [messages, isAgentIdle, isRunning]);

  if (messages.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col pb-4">
      {messages.map((message, index) => {
        const isAssistant = message.role === "assistant";
        const prevMessage = index > 0 ? messages[index - 1] : null;
        const showAvatar = isAssistant && (!prevMessage || prevMessage.role !== "assistant");

        return <MessageItem key={message.id} message={message} showAvatar={showAvatar} />;
      })}

      {isRunning && !hasAssistantInCurrentTurn ? (
        <PendingAssistantRow showDots={isAgentIdle} />
      ) : null}

      {isRunning && hasAssistantInCurrentTurn && isAgentIdle ? (
        <div className="mr-auto mt-1 flex w-full max-w-[95%] items-start gap-4">
          <div className="w-8 shrink-0" />
          <div className="mt-1 flex h-6 items-center gap-1.5">
            <div
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-300"
              style={{ animationDelay: "0ms", animationDuration: "1s" }}
            />
            <div
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-300"
              style={{ animationDelay: "150ms", animationDuration: "1s" }}
            />
            <div
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-300"
              style={{ animationDelay: "300ms", animationDuration: "1s" }}
            />
          </div>
        </div>
      ) : null}
      
      <div ref={scrollAnchorRef} className="h-4" />
    </div>
  );
}
