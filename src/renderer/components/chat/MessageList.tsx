import { useRef, useEffect, useState, useMemo, useLayoutEffect } from "react";
import { useAtom } from "jotai";
import type { ConversationMessage } from "../../types";
import { messagesAtom, isAgentIdleAtom, isRunningAtom } from "../../store/chat";
import { currentSessionIdAtom } from "../../store/workspace";
import { MarkdownMessage } from "./MarkdownMessage";
import { EmptyState } from "./EmptyState";

function BouncingDots() {
  return (
    <div className="flex h-6 items-center gap-1.5">
      {[0, 150, 300].map((delay) => (
        <div
          key={delay}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-300"
          style={{ animationDelay: `${delay}ms`, animationDuration: "1s" }}
        />
      ))}
    </div>
  );
}

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

        {showDots ? <BouncingDots /> : null}
      </div>
    </div>
  );
}

export function MessageList() {
  const [messages] = useAtom(messagesAtom);
  const [isAgentIdle] = useAtom(isAgentIdleAtom);
  const [isRunning] = useAtom(isRunningAtom);
  const [currentSessionId] = useAtom(currentSessionIdAtom);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const previousSessionIdRef = useRef<string | null>(currentSessionId);
  const shouldSnapToBottomRef = useRef(false);
  const [isScrolledUp, setIsScrolledUp] = useState(false);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) {
      return;
    }

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsScrolledUp(distanceFromBottom > 50);
  };

  const scrollToBottom = () => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    setIsScrolledUp(false);
    container.scrollTop = container.scrollHeight;
  };

  const lastUserIndex = useMemo(
    () => messages.reduce((acc, msg, i) => (msg.role === "user" ? i : acc), -1),
    [messages]
  );

  const hasAssistantInCurrentTurn = useMemo(
    () => lastUserIndex >= 0 && messages.slice(lastUserIndex + 1).some((m) => m.role === "assistant"),
    [messages, lastUserIndex]
  );

  useEffect(() => {
    if (previousSessionIdRef.current !== currentSessionId) {
      previousSessionIdRef.current = currentSessionId;
      shouldSnapToBottomRef.current = true;
      setIsScrolledUp(false);
    }
  }, [currentSessionId]);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    if (shouldSnapToBottomRef.current) {
      container.scrollTop = container.scrollHeight;
      shouldSnapToBottomRef.current = false;
      return;
    }

    if (!isScrolledUp) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, isAgentIdle, isRunning, isScrolledUp, currentSessionId]);

  if (messages.length === 0) {
    return (
      <div className="h-full w-full overflow-y-auto px-5 py-5 sm:px-8 custom-scrollbar overscroll-none">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div
        className="h-full w-full overflow-y-auto px-5 py-5 sm:px-8 custom-scrollbar overscroll-none"
        ref={scrollContainerRef}
        onScroll={handleScroll}
      >
        <div className="mx-auto flex max-w-4xl flex-col pb-4">
          {messages.map((message) => (
            <TempMessageBridge key={message.id} message={message} />
          ))}

          {isRunning && !hasAssistantInCurrentTurn ? (
            <PendingAssistantRow showDots={isAgentIdle} />
          ) : null}

          {isRunning && hasAssistantInCurrentTurn && isAgentIdle ? (
            <div className="mr-auto mt-1 flex w-full max-w-[95%] items-start gap-4">
              <div className="w-8 shrink-0" />
              <BouncingDots />
            </div>
          ) : null}

          <div className="h-4" />
        </div>
      </div>

      {isScrolledUp ? (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center justify-center rounded-full border border-stone-200 bg-white p-2 text-stone-500 shadow-md transition-all hover:scale-105 hover:text-stone-900 active:scale-95"
          title="回到底部"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

function TempMessageBridge({ message }: { message: ConversationMessage }) {
  if (message.role === "user") {
    return (
      <article className="ml-auto mt-6 flex max-w-[85%] flex-col items-end gap-1">
        {message.text ? (
          <div className="max-w-full rounded-[24px] rounded-tr-[8px] bg-[#f0e8dc] px-4 py-3 text-stone-900 shadow-sm">
            <div className="whitespace-pre-wrap text-[15px] leading-[1.6]">{message.text}</div>
          </div>
        ) : null}
      </article>
    );
  }

  const turn = message.turn;
  if (!turn) {
    return null;
  }

  const toolCount = turn.processSteps.filter((step) => step.type === "tool").length;
  const hasThinking = turn.processSteps.some((step) => step.type === "thinking");
  const isStreaming = turn.status === "streaming";

  return (
    <article className="mr-auto mt-8 flex w-full max-w-[95%] items-start gap-4">
      <div className="mt-1 flex w-8 shrink-0 justify-center">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-500 text-white shadow-sm">
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
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[14px] font-semibold text-stone-800">Zora</span>
        </div>
        {(hasThinking || toolCount > 0) ? (
          <div className="mb-2 text-[13px] text-stone-400">
            {hasThinking ? "analyzed" : ""}
            {hasThinking && toolCount > 0 ? ", " : ""}
            {toolCount > 0 ? `${toolCount} tool calls` : ""}
            {isStreaming ? " ..." : ""}
          </div>
        ) : null}
        {turn.bodySegments.map((segment, index) =>
          segment.text.trim().length > 0 ? (
            <div
              key={segment.id}
              className="max-w-[680px] break-words text-[15px] leading-[1.7] text-stone-800"
            >
              {index > 0 ? <div className="my-4 h-px bg-stone-200/60" /> : null}
              <MarkdownMessage content={segment.text} />
              {isStreaming && index === turn.bodySegments.length - 1 ? (
                <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-stone-300 align-text-bottom" />
              ) : null}
            </div>
          ) : null
        )}
        {turn.error ? (
          <div className="mt-3 rounded-xl bg-rose-50/80 px-4 py-3 text-[14px] text-rose-800 ring-1 ring-rose-200/50">
            {turn.error}
          </div>
        ) : null}
      </div>
    </article>
  );
}
