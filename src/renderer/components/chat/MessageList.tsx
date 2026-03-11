import { useRef, useEffect } from "react";
import { useAtom } from "jotai";
import { messagesAtom } from "../../store/chat";
import { MessageItem } from "./MessageItem";
import { EmptyState } from "./EmptyState";

/**
 * 消息列表组件
 * 显示所有消息并自动滚动到底部
 */
export function MessageList() {
  const [messages] = useAtom(messagesAtom);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);

  // 自动滚动到底部
  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end"
    });
  }, [messages]);

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
      <div ref={scrollAnchorRef} className="h-4" />
    </div>
  );
}
