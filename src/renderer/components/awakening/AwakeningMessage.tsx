import type { ChatMessage } from "../../../shared/zora";
import { MarkdownMessage } from "../chat/MarkdownMessage";

interface Props {
  message: ChatMessage;
  textColorClass: string;
}

export function AwakeningMessage({ message, textColorClass }: Props) {
  const isUser = message.role === "user";

  return (
    <div className={`flex flex-col w-full ${isUser ? "items-end" : "items-start"}`}>
      <div
        className={[
          "max-w-[85%] rounded-2xl px-5 py-3",
          isUser
            ? "bg-[#f0e8dc] text-stone-800"      // 用户：暖棕
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
            <MarkdownMessage content={message.text} />
          )
        ) : (
          message.status === "streaming" && (
            <span className="inline-block w-2 h-2 rounded-full bg-current animate-pulse mt-2" />
          )
        )}
      </div>
    </div>
  );
}
