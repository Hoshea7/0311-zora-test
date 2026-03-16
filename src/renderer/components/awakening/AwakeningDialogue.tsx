import { useMemo } from "react";
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

      <div className="flex-1 overflow-y-auto pt-[60px] pb-4">
        <div className="mx-auto w-full max-w-xl px-6 space-y-6 flex flex-col">
          {filteredMessages.map((msg, idx) => {
            const isLast = idx === filteredMessages.length - 1;
            const isWaiting = isLast && msg.role === "user" && isRunning;
            
            return (
              <AwakeningMessage
                key={msg.id}
                message={msg}
                isWaiting={isWaiting}
              />
            );
          })}
          {isRunning && filteredMessages.length > 0 && filteredMessages[filteredMessages.length - 1].role !== "user" && (
            <div className="flex flex-col items-start w-full">
              <span className="inline-block w-2 h-2 rounded-full bg-stone-300 animate-pulse mt-2" />
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
