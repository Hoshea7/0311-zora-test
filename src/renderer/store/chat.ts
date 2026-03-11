import { atom } from "jotai";
import type { ChatMessage, ChatMessageStatus, ChatMessageType } from "../types";
import { createId, stringifyUnknown } from "../utils/message";

// 基础状态 atoms
export const messagesAtom = atom<ChatMessage[]>([]);
export const isRunningAtom = atom(false);
export const draftAtom = atom("");

const FALLBACK_ASSISTANT_TEXT = "The agent stopped before returning a final reply.";
const FALLBACK_TOOL_ERROR = "Tool execution stopped before returning a result.";

type AssistantStreamStartPayload =
  | {
      type: "text";
      text?: string;
    }
  | {
      type: "thinking";
      thinking?: string;
    };

type AssistantHydrationPayload =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "thinking";
      thinking: string;
    }
  | {
      type: "tool_use";
      toolName: string;
      toolUseId: string;
      toolInput: string;
    }
  | null;

function findLastMessageIndex(
  messages: ChatMessage[],
  predicate: (message: ChatMessage, index: number) => boolean
) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (predicate(messages[index], index)) {
      return index;
    }
  }

  return -1;
}

function getMessageType(message: ChatMessage): ChatMessageType {
  return message.type ?? "text";
}

function createAssistantMessage(
  type: ChatMessageType,
  overrides: Partial<ChatMessage> = {}
): ChatMessage {
  return {
    id: createId(type === "tool_use" ? "tooluse" : type),
    role: "assistant",
    type,
    text: "",
    thinking: "",
    status: "streaming",
    ...overrides
  };
}

function appendAssistantChunk(
  messages: ChatMessage[],
  type: Extract<ChatMessageType, "text" | "thinking">,
  chunk: string
) {
  if (chunk.length === 0) {
    return messages;
  }

  const targetIndex = findLastMessageIndex(
    messages,
    (message) =>
      message.role === "assistant" &&
      message.status === "streaming" &&
      getMessageType(message) === type
  );

  if (targetIndex === -1) {
    return messages;
  }

  return messages.map((message, index) => {
    if (index !== targetIndex) {
      return message;
    }

    return type === "text"
      ? {
          ...message,
          text: `${message.text}${chunk}`
        }
      : {
          ...message,
          thinking: `${message.thinking}${chunk}`
        };
  });
}

function findLastAssistantMessageInActiveTurn(
  messages: ChatMessage[],
  predicate: (message: ChatMessage) => boolean
) {
  const lastUserIndex = findLastMessageIndex(messages, (message) => message.role === "user");

  for (let index = messages.length - 1; index > lastUserIndex; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant" && predicate(message)) {
      return index;
    }
  }

  return -1;
}

function hydrateAssistantMessage(
  message: ChatMessage,
  payload: Exclude<AssistantHydrationPayload, null>
) {
  if (payload.type === "text") {
    return {
      ...message,
      text: payload.text || message.text,
      status: "done" as const
    };
  }

  if (payload.type === "thinking") {
    return {
      ...message,
      thinking: payload.thinking || message.thinking,
      status: "done" as const
    };
  }

  return {
    ...message,
    toolName: payload.toolName || message.toolName,
    toolUseId: payload.toolUseId || message.toolUseId,
    toolInput: payload.toolInput || message.toolInput || "",
    toolStatus: message.toolStatus ?? "running",
    status: "done" as const
  };
}

function createHydratedAssistantMessage(
  payload: Exclude<AssistantHydrationPayload, null>
): ChatMessage {
  if (payload.type === "text") {
    return createAssistantMessage("text", {
      text: payload.text,
      status: "done"
    });
  }

  if (payload.type === "thinking") {
    return createAssistantMessage("thinking", {
      thinking: payload.thinking,
      status: "done"
    });
  }

  return createAssistantMessage("tool_use", {
    toolName: payload.toolName,
    toolUseId: payload.toolUseId,
    toolInput: payload.toolInput,
    toolResult: "",
    toolStatus: "running",
    status: "done"
  });
}

function finalizeToolUseMessage(message: ChatMessage, status: ChatMessageStatus) {
  if (getMessageType(message) !== "tool_use" || message.toolStatus !== "running") {
    return message;
  }

  if (status === "done") {
    return message;
  }

  return {
    ...message,
    toolStatus: "error" as const,
    toolResult: message.toolResult || FALLBACK_TOOL_ERROR
  };
}

// 操作 atoms

/**
 * 开始新对话
 * 只创建用户消息，助手消息由流式事件驱动
 */
export const startConversationAtom = atom(null, (_get, set, prompt: string) => {
  const userId = createId("user");

  set(messagesAtom, (current) => [
    ...current,
    {
      id: userId,
      role: "user",
      type: "text",
      text: prompt,
      thinking: "",
      status: "done"
    }
  ]);
  set(isRunningAtom, true);
});

/**
 * 创建新的助手流式消息块
 * 每个 content_block_start 都会在消息尾部追加一条新消息
 */
export const startAssistantMessageAtom = atom(
  null,
  (_get, set, payload: AssistantStreamStartPayload) => {
    if (payload.type === "text") {
      set(messagesAtom, (current) => [
        ...current,
        createAssistantMessage("text", {
          text: payload.text ?? ""
        })
      ]);
      return;
    }

    set(messagesAtom, (current) => [
      ...current,
      createAssistantMessage("thinking", {
        thinking: payload.thinking ?? ""
      })
    ]);
  }
);

/**
 * 追加助手文本内容
 */
export const appendAssistantTextAtom = atom(null, (_get, set, chunk: string) => {
  if (chunk.length === 0) {
    return;
  }

  set(messagesAtom, (current) => appendAssistantChunk(current, "text", chunk));
});

/**
 * 追加助手思考内容
 */
export const appendAssistantThinkingAtom = atom(null, (_get, set, chunk: string) => {
  if (chunk.length === 0) {
    return;
  }

  set(messagesAtom, (current) => appendAssistantChunk(current, "thinking", chunk));
});

/**
 * 水合助手消息
 * 用于一次性设置完整的文本和思考内容
 */
export const hydrateAssistantAtom = atom(
  null,
  (_get, set, payload: AssistantHydrationPayload) => {
    if (!payload) {
      return;
    }

    set(messagesAtom, (current) => {
      const targetIndex = findLastAssistantMessageInActiveTurn(current, (message) => {
        if (payload.type === "tool_use") {
          return (
            getMessageType(message) === "tool_use" &&
            (message.toolUseId === payload.toolUseId || message.status === "streaming")
          );
        }

        return getMessageType(message) === payload.type;
      });

      if (targetIndex === -1) {
        return [...current, createHydratedAssistantMessage(payload)];
      }

      return current.map((message, index) =>
        index === targetIndex ? hydrateAssistantMessage(message, payload) : message
      );
    });
  }
);

/**
 * 开始工具调用消息
 */
export const startToolUseAtom = atom(
  null,
  (_get, set, toolName: string, toolUseId: string, toolInput: string = "") => {
    if (!toolName || !toolUseId) {
      return;
    }

    set(messagesAtom, (current) => [
      ...current,
      createAssistantMessage("tool_use", {
        toolName,
        toolUseId,
        toolInput,
        toolResult: "",
        toolStatus: "running"
      })
    ]);
  }
);

/**
 * 追加工具输入内容
 */
export const appendToolInputAtom = atom(null, (_get, set, chunk: string) => {
  if (chunk.length === 0) {
    return;
  }

  set(messagesAtom, (current) => {
    const targetIndex = findLastMessageIndex(
      current,
      (message) =>
        message.role === "assistant" &&
        getMessageType(message) === "tool_use" &&
        message.status === "streaming"
    );

    if (targetIndex === -1) {
      return current;
    }

    return current.map((message, index) =>
      index === targetIndex
        ? {
            ...message,
            toolInput: `${message.toolInput ?? ""}${chunk}`
          }
        : message
    );
  });
});

/**
 * 补全工具结果
 */
export const completeToolResultAtom = atom(
  null,
  (_get, set, toolUseId: string, content: unknown, isError = false) => {
    if (!toolUseId) {
      return;
    }

    set(messagesAtom, (current) =>
      current.map((message) =>
        message.toolUseId === toolUseId
          ? {
              ...message,
              toolResult: stringifyUnknown(content),
              toolStatus: isError ? "error" : "done",
              status: "done"
            }
          : message
      )
    );
  }
);

/**
 * 结束当前流式块
 */
export const completeStreamingMessageAtom = atom(null, (_get, set) => {
  set(messagesAtom, (current) => {
    const targetIndex = findLastMessageIndex(
      current,
      (message) => message.role === "assistant" && message.status === "streaming"
    );

    if (targetIndex === -1) {
      return current;
    }

    return current.map((message, index) =>
      index === targetIndex
        ? {
            ...message,
            status: "done"
          }
        : message
    );
  });
});

/**
 * 完成对话
 * 设置最终状态并清理运行标志
 */
export const completeConversationAtom = atom(
  null,
  (_get, set, status: Exclude<ChatMessageStatus, "error">) => {
    set(messagesAtom, (current) =>
      current.map<ChatMessage>((message) => {
        if (message.role !== "assistant") {
          return message;
        }

        if (message.status === "streaming") {
          return finalizeToolUseMessage(
            {
              ...message,
              status
            },
            status
          );
        }

        return finalizeToolUseMessage(message, status);
      })
    );
    set(isRunningAtom, false);
  }
);

/**
 * 对话失败
 * 设置错误状态和错误消息
 */
export const failConversationAtom = atom(null, (_get, set, errorMessage: string) => {
  set(messagesAtom, (current) => {
    const lastAssistantIndex = findLastMessageIndex(
      current,
      (message) => message.role === "assistant"
    );

    if (lastAssistantIndex === -1) {
      return [
        ...current,
        createAssistantMessage("text", {
          text: "The agent could not start.",
          status: "error",
          error: errorMessage
        })
      ];
    }

    return current.map<ChatMessage>((message, index) => {
      if (message.role !== "assistant") {
        return message;
      }

      const isToolUse = getMessageType(message) === "tool_use";
      const shouldMarkAsErrored =
        index === lastAssistantIndex || message.status === "streaming";

      if (!shouldMarkAsErrored && !(isToolUse && message.toolStatus === "running")) {
        return message;
      }

      return {
        ...message,
        status: shouldMarkAsErrored ? "error" : message.status,
        error: shouldMarkAsErrored ? errorMessage : message.error,
        text:
          getMessageType(message) === "text" && !message.text
            ? FALLBACK_ASSISTANT_TEXT
            : message.text,
        toolStatus: isToolUse ? "error" : message.toolStatus,
        toolResult:
          isToolUse && !message.toolResult
            ? FALLBACK_TOOL_ERROR
            : message.toolResult
      };
    });
  });

  set(isRunningAtom, false);
});
