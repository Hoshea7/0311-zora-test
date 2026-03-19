import type { ConversationMessage } from "../../../shared/zora";
import { MarkdownMessage } from "../chat/MarkdownMessage";

interface Props {
  message: ConversationMessage;
}

export function AwakeningMessage({ message }: Props) {
  const isUser = message.role === "user";
  const assistantText = message.turn?.bodySegments.map((segment) => segment.text).join("\n\n") ?? "";
  const isStreaming = message.turn?.status === "streaming";

  return (
    <div className={`flex flex-col w-full ${isUser ? "items-end" : "items-start"}`}>
      <div
        className={[
          isUser ? "max-w-[85%] rounded-[20px] px-5 py-3" : "max-w-xl py-2",
          isUser
            ? "bg-[#f0e8dc] text-stone-900"      // 用户：暖棕
            : "bg-transparent text-stone-800",   // Zora：无背景，文字直出
          "animate-fade-in",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {isUser && message.text ? (
          <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{message.text}</p>
        ) : !isUser && assistantText ? (
          <div className="text-[16px] leading-relaxed">
            <MarkdownMessage content={assistantText} />
          </div>
        ) : (
          isStreaming && !isUser && (
            <span className="inline-block w-2 h-2 rounded-full bg-stone-300 animate-pulse mt-2" />
          )
        )}
      </div>
    </div>
  );
}
