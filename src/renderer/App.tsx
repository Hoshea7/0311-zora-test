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
  startToolUseAtom
} from "./store/chat";
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

  // 处理 Agent 流式事件
  useEffect(() => {
    return window.zora.onStream((streamEvent) => {
      console.log("[renderer event]", JSON.stringify(streamEvent).slice(0, 500));

      if (streamEvent.type === "agent_error") {
        failConversation(
          getAgentErrorText(isRecord(streamEvent) ? streamEvent.error : undefined)
        );
        return;
      }

      if (streamEvent.type === "agent_status") {
        if (streamEvent.status === "finished") {
          completeConversation("done");
        }

        if (streamEvent.status === "stopped") {
          completeConversation("stopped");
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
            }
          });
        }

        return;
      }

      if (streamEvent.type === "assistant") {
        hydrateAssistant(extractAssistantPayload(streamEvent.message));
        return;
      }

      if (streamEvent.type === "result") {
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
        } else {
          startAssistantMessage(chunks.blockStart);
        }
      }

      if (chunks.textDelta) {
        appendAssistantText(chunks.textDelta);
      }

      if (chunks.thinkingDelta) {
        appendAssistantThinking(chunks.thinkingDelta);
      }

      if (chunks.toolInputDelta) {
        appendToolInput(chunks.toolInputDelta);
      }

      if (
        streamEvent.type === "stream_event" &&
        isRecord(streamEvent.event) &&
        streamEvent.event.type === "content_block_stop"
      ) {
        completeStreamingMessage();
      }
    });
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
    startToolUse
  ]);

  return <AppShell />;
}
