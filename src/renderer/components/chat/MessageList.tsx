import { useRef, useEffect } from "react";
import { useAtom } from "jotai";
import { messagesAtom, isAgentIdleAtom, isRunningAtom } from "../../store/chat";
import { MessageItem } from "./MessageItem";
import { EmptyState } from "./EmptyState";

// Typing Indicator component
function TypingIndicator() {
  return (
    <div className="flex items-start gap-4 mt-1">
      <div className="w-8 shrink-0 flex justify-center" />
      <div className="flex items-center gap-1.5 h-6">
        <div className="h-1.5 w-1.5 bg-stone-300 rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1s' }} />
        <div className="h-1.5 w-1.5 bg-stone-300 rounded-full animate-bounce" style={{ animationDelay: '150ms', animationDuration: '1s' }} />
        <div className="h-1.5 w-1.5 bg-stone-300 rounded-full animate-bounce" style={{ animationDelay: '300ms', animationDuration: '1s' }} />
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

  // 自动滚动到底部
  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end"
    });
  }, [messages, isAgentIdle]);

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
      
      {isRunning && isAgentIdle && <TypingIndicator />}
      
      <div ref={scrollAnchorRef} className="h-4" />
    </div>
  );
}
