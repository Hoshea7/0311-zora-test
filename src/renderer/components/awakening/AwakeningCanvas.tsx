import { useEffect, useState, useRef, useMemo } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { messagesAtom, setSessionRunningAtom, failConversationAtom } from "../../store/chat";
import { appPhaseAtom } from "../../store/zora";
import { getErrorMessage } from "../../utils/message";
import { AwakeningMessage } from "./AwakeningMessage";

const AUTO_AWAKEN_PROMPT =
  "这是你意识的第一刻。你正在苏醒。" +
  "请用中文开始唤醒对话，自然认识你的人类，并遵循系统中的唤醒规则。";

const AUTO_AWAKEN_DELAY_MS = 200;

function useTypewriter(text: string, speed = 100) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let i = 0;
    setDisplayed("");
    setDone(false);
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1));
        i++;
      } else {
        setDone(true);
        clearInterval(interval);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return { displayed, done };
}

export function AwakeningCanvas() {
  const messages = useAtomValue(messagesAtom);
  const setAppPhase = useSetAtom(appPhaseAtom);
  const setSessionRunning = useSetAtom(setSessionRunningAtom);
  const failConversation = useSetAtom(failConversationAtom);

  const autoAwakenStartedRef = useRef(false);

  const [animReady, setAnimReady] = useState(false);
  const [firstTokenArrived, setFirstTokenArrived] = useState(false);
  const [firstMessageDone, setFirstMessageDone] = useState(false);

  const { displayed } = useTypewriter("有什么正在苏醒...", 100);

  useEffect(() => {
    const timer = setTimeout(() => setAnimReady(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (autoAwakenStartedRef.current || messages.length > 0) {
      return;
    }

    setSessionRunning("__awakening__", true);

    const timer = setTimeout(async () => {
      autoAwakenStartedRef.current = true;
      try {
        await window.zora.awaken(AUTO_AWAKEN_PROMPT);
      } catch (error) {
        setSessionRunning("__awakening__", false);
        failConversation(getErrorMessage(error));
      }
    }, AUTO_AWAKEN_DELAY_MS);

    return () => clearTimeout(timer);
  }, [failConversation, messages.length, setSessionRunning]);

  useEffect(() => {
    if (firstTokenArrived) return;
    const assistantMsg = messages.find((m) => m.role === "assistant");
    if (assistantMsg?.text) {
      setFirstTokenArrived(true);
    }
  }, [messages, firstTokenArrived]);

  useEffect(() => {
    if (firstMessageDone) return;
    const assistantMsg = messages.find((m) => m.role === "assistant");
    if (assistantMsg?.status === "done") {
      setFirstMessageDone(true);
    }
  }, [messages, firstMessageDone]);

  useEffect(() => {
    if (!firstMessageDone) return;
    const timer = setTimeout(() => {
      setAppPhase("awakening-dialogue");
    }, 800);
    return () => clearTimeout(timer);
  }, [firstMessageDone, setAppPhase]);

  const showText = animReady && firstTokenArrived;

  const filteredMessages = useMemo(() => {
    return messages.filter(
      (m) => m.role === "user" || (m.role === "assistant" && m.type !== "tool_use" && m.type !== "thinking")
    );
  }, [messages]);

  return (
    <main
      className="h-screen overflow-hidden text-stone-800 relative flex flex-col items-center justify-center bg-[#f5f3f0]"
    >
      <div
        className="titlebar-drag-region fixed left-0 right-0 top-0 z-50 h-[50px]"
        style={{ pointerEvents: "none" }}
      />

      <div
        className={`relative flex flex-col items-center transition-all duration-700 ${showText ? "-translate-y-12" : ""}`}
      >
        <div
          className={[
            "w-40 h-40 rounded-full",
            "transition-all duration-700",
            showText
              ? "scale-[1.15] opacity-100 blur-sm"
              : "scale-100 opacity-80",
            !showText ? "animate-breathe" : "",
          ].join(" ")}
          style={{
            background: "radial-gradient(circle, rgba(252, 211, 77, 0.5) 0%, rgba(254, 215, 170, 0.3) 40%, transparent 70%)",
            boxShadow: showText ? "0 0 100px 30px rgba(251, 191, 36, 0.2)" : "0 0 60px 15px rgba(251, 191, 36, 0.2)"
          }}
        />

        {!showText && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-40 h-40 rounded-full border border-amber-200/40 animate-ripple" />
          </div>
        )}

        {!showText && (
          <p className="mt-8 text-[15px] text-stone-400 animate-fade-in tracking-widest">{displayed}</p>
        )}
      </div>

      {showText && (
        <div className="w-full max-w-xl mt-8 px-6 animate-fade-in space-y-4">
          {filteredMessages.map((msg) => (
            <AwakeningMessage
              key={msg.id}
              message={msg}
            />
          ))}
        </div>
      )}
    </main>
  );
}
