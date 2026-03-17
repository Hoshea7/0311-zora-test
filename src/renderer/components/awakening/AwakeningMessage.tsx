import type { ChatMessage } from "../../../shared/zora";
import { MarkdownMessage } from "../chat/MarkdownMessage";

interface Props {
  message: ChatMessage;
}

export function AwakeningMessage({ message }: Props) {
  const isUser = message.role === "user";

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
        {message.text ? (
          isUser ? (
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{message.text}</p>
          ) : (
            <div className="text-[16px] leading-relaxed">
              <MarkdownMessage content={message.text} />
            </div>
          )
        ) : (
          message.status === "streaming" && !isUser && (
            <span className="inline-block w-2 h-2 rounded-full bg-stone-300 animate-pulse mt-2" />
          )
        )}
      </div>
    </div>
  );
}
