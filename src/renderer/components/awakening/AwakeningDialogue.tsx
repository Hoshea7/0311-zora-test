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
import { ChatInput } from "../chat/ChatInput";
import { Button } from "../ui/Button";
import { AwakeningMessage } from "./AwakeningMessage";

export function AwakeningDialogue() {
  const startConversation = useSetAtom(startConversationAtom);
  const failConversation = useSetAtom(failConversationAtom);
  const [draft, setDraft] = useAtom(draftAtom);
  const [messages, setMessages] = useAtom(messagesAtom);
  const setSessionRunning = useSetAtom(setSessionRunningAtom);
  const completeAwakening = useSetAtom(completeAwakeningAtom);
  const clearAllHitl = useSetAtom(clearAllHitlAtom);
  const isRunning = useAtomValue(isRunningAtom);

  const userMessageCount = useMemo(
    () => messages.filter((m) => m.role === "user").length,
    [messages]
  );

  const bgStyle = useMemo(() => {
    const backgrounds = [
      "#e6e1d8",
      "#ebe7df",
      "#f0ece6",
      "#f5f3f0",
      "#f5f3f0",
    ];
    const idx = Math.min(userMessageCount, backgrounds.length - 1);
    return { backgroundColor: backgrounds[idx] };
  }, [userMessageCount]);

  const textColor = "text-stone-800";

  const handleSubmit = async () => {
    const text = draft.trim();
    if (!text) return;
    startConversation(text);
    setDraft("");
    try {
      await window.zora.awaken(text);
    } catch (error) {
      failConversation(getErrorMessage(error));
    }
  };

  const handleStop = async () => {
    try {
      await window.zora.stopAgent("__awakening__");
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

  return (
    <main
      className="h-screen overflow-hidden relative flex flex-col transition-colors duration-1000"
      style={bgStyle}
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
          {messages
            .filter((m) => m.type !== "tool_use")
            .map((msg) => (
              <AwakeningMessage
                key={msg.id}
                message={msg}
                textColorClass={textColor}
              />
            ))}
        </div>
      </div>

      <footer className="titlebar-no-drag shrink-0 px-6 py-4">
        <div className="mx-auto w-full max-w-xl">
          <ChatInput onSubmit={handleSubmit} onStop={handleStop} />
        </div>
      </footer>
    </main>
  );
}
