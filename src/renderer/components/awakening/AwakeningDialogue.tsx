import { useLayoutEffect, useMemo, useRef } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  startConversationAtom,
  failConversationAtom,
  draftAtom,
  isRunningAtom,
  messagesAtom,
  setSessionRunningAtom,
} from "../../store/chat";
import { completeAwakeningAtom } from "../../store/zora";
import { clearAllHitlAtom } from "../../store/hitl";
import { getErrorMessage } from "../../utils/message";
import { Button } from "../ui/Button";
import { AwakeningMessage } from "./AwakeningMessage";
import { AwakeningInput } from "./AwakeningInput";

export function AwakeningDialogue() {
  const startConversation = useSetAtom(startConversationAtom);
  const failConversation = useSetAtom(failConversationAtom);
  const [draft, setDraft] = useAtom(draftAtom);
  const [messages, setMessages] = useAtom(messagesAtom);
  const setSessionRunning = useSetAtom(setSessionRunningAtom);
  const completeAwakening = useSetAtom(completeAwakeningAtom);
  const clearAllHitl = useSetAtom(clearAllHitlAtom);
  const isRunning = useAtomValue(isRunningAtom);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const handleSubmit = async (text: string) => {
    if (!text) return;
    startConversation(text);
    setDraft("");
    try {
      await window.zora.awaken(text);
    } catch (error) {
      failConversation(getErrorMessage(error));
    }
  };

  const handleSkip = async () => {
    setDraft("");
    setMessages([]);
    clearAllHitl();
    setSessionRunning("__awakening__", false);
    try {
      await window.zora.awakeningComplete();
    } catch (error) {
      console.warn("[awakening] Skip failed.", error);
    }
    completeAwakening();
  };

  const filteredMessages = useMemo(() => {
    return messages.filter(
      (m) => m.role === "user" || (m.role === "assistant" && m.type !== "tool_use" && m.type !== "thinking")
    );
  }, [messages]);

  const shouldShowThinkingIndicator = (() => {
    const last = messages[messages.length - 1];

    if (!isRunning || !last) {
      return false;
    }

    if (last.role === "user") {
      return true;
    }

    return last.role === "assistant" && (last.type === "thinking" || last.type === "tool_use");
  })();

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });

    return () => cancelAnimationFrame(frame);
  }, [filteredMessages, shouldShowThinkingIndicator]);

  return (
    <main
      className="h-screen overflow-hidden relative flex flex-col transition-colors duration-1000 bg-[#f5f3f0]"
    >
      <div
        className="titlebar-drag-region fixed left-0 right-0 top-0 z-50 h-[50px]"
        style={{ pointerEvents: "none" }}
      />

      <div className="titlebar-no-drag absolute right-5 top-3 z-40">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSkip}
          className="text-stone-400 hover:text-stone-600 transition-colors"
        >
          跳过
        </Button>
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pt-[60px] pb-4">
        <div className="mx-auto w-full max-w-xl px-6 space-y-6 flex flex-col">
          {filteredMessages.map((msg, idx) => {
            return (
              <AwakeningMessage
                key={msg.id}
                message={msg}
              />
            );
          })}
          {shouldShowThinkingIndicator && (
            <div className="flex items-center gap-2 px-1 py-3 animate-fade-in">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400/70 animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400/70 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400/70 animate-bounce [animation-delay:300ms]" />
              </div>
              <span className="text-xs text-stone-400">让我想想...</span>
            </div>
          )}
        </div>
      </div>

      <footer className="titlebar-no-drag shrink-0 px-6 py-4">
        <AwakeningInput onSubmit={handleSubmit} disabled={isRunning} />
      </footer>
    </main>
  );
}
