import { useEffect } from "react";
import { useSetAtom } from "jotai";
import {
  startAssistantMessageAtom,
  appendAssistantTextAtom,
  appendAssistantThinkingAtom,
  appendToolInputAtom,
  completeStreamingMessageAtom,
  completeToolResultAtom,
  hydrateAssistantAtom,
  completeConversationAtom,
  failConversationAtom,
  startToolUseAtom,
  isAgentIdleAtom
} from "./store/chat";
import {
  pushPermissionAtom,
  resolvePermissionAtom,
  pushAskUserAtom,
  resolveAskUserAtom,
  clearAllHitlAtom,
} from "./store/hitl";
import type { PermissionRequest, AskUserRequest } from "../shared/zora";
import {
  extractStreamChunks,
  extractAssistantPayload,
  extractToolResultContent,
  getAgentErrorText,
  isRecord
} from "./utils/message";
import { AppShell } from "./components/layout/AppShell";

/**
 * 应用根组件
 * 负责初始化和流式事件处理
 */
export default function App() {
  const startAssistantMessage = useSetAtom(startAssistantMessageAtom);
  const appendAssistantText = useSetAtom(appendAssistantTextAtom);
  const appendAssistantThinking = useSetAtom(appendAssistantThinkingAtom);
  const appendToolInput = useSetAtom(appendToolInputAtom);
  const completeStreamingMessage = useSetAtom(completeStreamingMessageAtom);
  const completeToolResult = useSetAtom(completeToolResultAtom);
  const hydrateAssistant = useSetAtom(hydrateAssistantAtom);
  const completeConversation = useSetAtom(completeConversationAtom);
  const failConversation = useSetAtom(failConversationAtom);
  const startToolUse = useSetAtom(startToolUseAtom);
  const setIsAgentIdle = useSetAtom(isAgentIdleAtom);
  const pushPermission = useSetAtom(pushPermissionAtom);
  const resolvePermission = useSetAtom(resolvePermissionAtom);
  const pushAskUser = useSetAtom(pushAskUserAtom);
  const resolveAskUser = useSetAtom(resolveAskUserAtom);
  const clearAllHitl = useSetAtom(clearAllHitlAtom);

  // 处理 Agent 流式事件
  useEffect(() => {
    const zora = window.zora;
    if (!zora) {
      return;
    }

    let idleTimer: ReturnType<typeof setTimeout> | undefined;

    const clearIdleTimer = () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
    };

    const bumpContentActivity = () => {
      setIsAgentIdle(false);
      clearIdleTimer();
      idleTimer = setTimeout(() => setIsAgentIdle(true), 450);
    };

    const unsubscribe = zora.onStream((streamEvent) => {
      console.log("[renderer event]", JSON.stringify(streamEvent).slice(0, 500));

      // ─── HITL 事件分发 ───
      if (streamEvent.type === "permission_request" && "request" in streamEvent) {
        pushPermission(streamEvent.request as PermissionRequest);
        return;
      }
      if (streamEvent.type === "permission_resolved" && "requestId" in streamEvent) {
        resolvePermission(streamEvent.requestId as string);
        return;
      }
      if (streamEvent.type === "ask_user_request" && "request" in streamEvent) {
        pushAskUser(streamEvent.request as AskUserRequest);
        return;
      }
      if (streamEvent.type === "ask_user_resolved" && "requestId" in streamEvent) {
        resolveAskUser(streamEvent.requestId as string);
        return;
      }

      if (streamEvent.type === "agent_error") {
        clearIdleTimer();
        setIsAgentIdle(false);
        failConversation(
          getAgentErrorText(isRecord(streamEvent) ? streamEvent.error : undefined)
        );
        return;
      }

      if (streamEvent.type === "agent_status") {
        if (streamEvent.status === "started") {
          bumpContentActivity();
          return;
        }

        if (streamEvent.status === "finished") {
          clearIdleTimer();
          setIsAgentIdle(false);
          completeConversation("done");
          clearAllHitl();
        }

        if (streamEvent.status === "stopped") {
          clearIdleTimer();
          setIsAgentIdle(false);
          completeConversation("stopped");
          clearAllHitl();
        }

        return;
      }

      if (streamEvent.type === "user" && isRecord(streamEvent.message)) {
        const content = streamEvent.message.content;
        if (Array.isArray(content)) {
          content.forEach((block) => {
            if (
              isRecord(block) &&
              block.type === "tool_result" &&
              typeof block.tool_use_id === "string"
            ) {
              completeToolResult(
                block.tool_use_id,
                extractToolResultContent(block.content),
                block.is_error === true
              );
              bumpContentActivity();
            }
          });
        }
        return;
      }

      if (streamEvent.type === "assistant") {
        hydrateAssistant(extractAssistantPayload(streamEvent.message));
        bumpContentActivity();
        return;
      }

      if (streamEvent.type === "result") {
        clearIdleTimer();
        setIsAgentIdle(false);
        completeConversation("done");
        return;
      }

      const chunks = extractStreamChunks(streamEvent);
      if (chunks.blockStart) {
        if (chunks.blockStart.type === "tool_use") {
          startToolUse(
            chunks.blockStart.toolName,
            chunks.blockStart.toolUseId,
            chunks.blockStart.toolInput
          );
          bumpContentActivity();
        } else {
          startAssistantMessage(chunks.blockStart);
          bumpContentActivity();
        }
      }

      if (chunks.textDelta) {
        appendAssistantText(chunks.textDelta);
        bumpContentActivity();
      }

      if (chunks.thinkingDelta) {
        appendAssistantThinking(chunks.thinkingDelta);
        bumpContentActivity();
      }

      if (chunks.toolInputDelta) {
        appendToolInput(chunks.toolInputDelta);
        bumpContentActivity();
      }

      if (
        streamEvent.type === "stream_event" &&
        isRecord(streamEvent.event) &&
        streamEvent.event.type === "content_block_stop"
      ) {
        completeStreamingMessage();
      }
    });

    return () => {
      clearIdleTimer();
      unsubscribe();
    };
  }, [
    startAssistantMessage,
    appendAssistantText,
    appendAssistantThinking,
    appendToolInput,
    completeConversation,
    completeStreamingMessage,
    completeToolResult,
    failConversation,
    hydrateAssistant,
    startToolUse,
    setIsAgentIdle,
    pushPermission,
    resolvePermission,
    pushAskUser,
    resolveAskUser,
    clearAllHitl
  ]);

  return <AppShell />;
}
