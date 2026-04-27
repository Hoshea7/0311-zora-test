import type { Query, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { vi } from "vitest";

const DEFAULT_SESSION_ID = "mock-session";
const DEFAULT_MODEL = "claude-sonnet-mock";

type MockSessionState = {
  closed: boolean;
  interrupted: boolean;
};

function asSdkMessage<T extends Record<string, unknown>>(message: T): SDKMessage {
  return message as unknown as SDKMessage;
}

function createSystemInitMessage(
  sessionId = DEFAULT_SESSION_ID,
  model = DEFAULT_MODEL
): SDKMessage {
  return asSdkMessage({
    type: "system",
    subtype: "init",
    session_id: sessionId,
    uuid: `${sessionId}-system-init`,
    apiKeySource: "env",
    claude_code_version: "test",
    cwd: process.cwd(),
    tools: ["Read", "Write", "Bash"],
    mcp_servers: [],
    model,
    permissionMode: "bypassPermissions",
    slash_commands: [],
    output_style: "text",
    skills: [],
    plugins: [],
  });
}

function createStreamEventMessage(
  event: Record<string, unknown>,
  sequence: number,
  sessionId = DEFAULT_SESSION_ID,
  parentToolUseId: string | null = null
): SDKMessage {
  return asSdkMessage({
    type: "stream_event",
    event,
    parent_tool_use_id: parentToolUseId,
    uuid: `${sessionId}-stream-${sequence}`,
    session_id: sessionId,
  });
}

function createAssistantMessage(
  content: Array<Record<string, unknown>>,
  sessionId = DEFAULT_SESSION_ID
): SDKMessage {
  return asSdkMessage({
    type: "assistant",
    message: {
      id: `${sessionId}-assistant-message`,
      type: "message",
      role: "assistant",
      content,
    },
    parent_tool_use_id: null,
    uuid: `${sessionId}-assistant`,
    session_id: sessionId,
  });
}

function createUserToolResultMessage(
  blocks: Array<Record<string, unknown>>,
  sessionId = DEFAULT_SESSION_ID,
  toolUseResult: unknown = blocks
): SDKMessage {
  return asSdkMessage({
    type: "user",
    message: {
      role: "user",
      content: blocks,
    },
    parent_tool_use_id: null,
    tool_use_result: toolUseResult,
    uuid: `${sessionId}-user-tool-result`,
    session_id: sessionId,
  });
}

function createResultSuccessMessage(
  result = "OK",
  sessionId = DEFAULT_SESSION_ID
): SDKMessage {
  return asSdkMessage({
    type: "result",
    subtype: "success",
    duration_ms: 1,
    duration_api_ms: 1,
    is_error: false,
    num_turns: 1,
    result,
    stop_reason: "end_turn",
    total_cost_usd: 0,
    usage: {
      input_tokens: 1,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: 1,
      server_tool_use: {
        web_search_requests: 0,
      },
      service_tier: "standard",
    },
    modelUsage: {},
    permission_denials: [],
    uuid: `${sessionId}-result`,
    session_id: sessionId,
  });
}

export const MOCK_EVENTS = {
  simpleTextReply: [
    createSystemInitMessage(),
    createStreamEventMessage(
      {
        type: "content_block_start",
        content_block: {
          type: "text",
          text: "",
        },
      },
      1
    ),
    createStreamEventMessage(
      {
        type: "content_block_delta",
        delta: {
          type: "text_delta",
          text: "Hello from Zora.",
        },
      },
      2
    ),
    createStreamEventMessage(
      {
        type: "content_block_stop",
      },
      3
    ),
    createStreamEventMessage(
      {
        type: "message_stop",
      },
      4
    ),
    createAssistantMessage([{ type: "text", text: "Hello from Zora." }]),
    createResultSuccessMessage("Hello from Zora."),
  ] satisfies SDKMessage[],

  withToolUse: [
    createSystemInitMessage(),
    createStreamEventMessage(
      {
        type: "content_block_start",
        content_block: {
          type: "text",
          text: "",
        },
      },
      1
    ),
    createStreamEventMessage(
      {
        type: "content_block_delta",
        delta: {
          type: "text_delta",
          text: "I will update that file.",
        },
      },
      2
    ),
    createStreamEventMessage(
      {
        type: "content_block_start",
        content_block: {
          type: "tool_use",
          id: "tool-write-1",
          name: "Write",
          input: {
            file_path: "/tmp/demo.txt",
            content: "updated",
          },
        },
      },
      3
    ),
    createUserToolResultMessage([
      {
        type: "tool_result",
        tool_use_id: "tool-write-1",
        content: "Write completed",
        is_error: false,
      },
    ]),
    createAssistantMessage([
      { type: "text", text: "I will update that file." },
      {
        type: "tool_use",
        id: "tool-write-1",
        name: "Write",
        input: {
          file_path: "/tmp/demo.txt",
          content: "updated",
        },
      },
      { type: "text", text: "Finished." },
    ]),
    createResultSuccessMessage("Finished."),
  ] satisfies SDKMessage[],

  awakeningReply: [
    createSystemInitMessage("awakening-session"),
    createStreamEventMessage(
      {
        type: "content_block_start",
        content_block: {
          type: "text",
          text: "",
        },
      },
      1,
      "awakening-session"
    ),
    createStreamEventMessage(
      {
        type: "content_block_delta",
        delta: {
          type: "text_delta",
          text: "这是纸面上的我。",
        },
      },
      2,
      "awakening-session"
    ),
    createStreamEventMessage(
      {
        type: "content_block_start",
        content_block: {
          type: "tool_use",
          id: "tool-soul-write",
          name: "Write",
          input: {
            file_path: "~/.zora/zoras/default/SOUL.md",
            content: "# SOUL.md\n\n说真话。",
          },
        },
      },
      3,
      "awakening-session"
    ),
    createUserToolResultMessage(
      [
        {
          type: "tool_result",
          tool_use_id: "tool-soul-write",
          content: "SOUL.md saved",
          is_error: false,
        },
      ],
      "awakening-session"
    ),
    createAssistantMessage(
      [
        { type: "text", text: "这是纸面上的我。" },
        {
          type: "tool_use",
          id: "tool-soul-write",
          name: "Write",
          input: {
            file_path: "~/.zora/zoras/default/SOUL.md",
            content: "# SOUL.md\n\n说真话。",
          },
        },
        { type: "text", text: "感觉对吗？" },
      ],
      "awakening-session"
    ),
    createResultSuccessMessage("感觉对吗？", "awakening-session"),
  ] satisfies SDKMessage[],
};

export type MockSdkSession = Query & {
  readonly state: Readonly<MockSessionState>;
};

export function createMockSdkSession(
  events: SDKMessage[] = MOCK_EVENTS.simpleTextReply
): MockSdkSession {
  let index = 0;
  const state: MockSessionState = {
    closed: false,
    interrupted: false,
  };

  const iterator: AsyncGenerator<SDKMessage, void> = {
    async next() {
      if (state.closed || index >= events.length) {
        return { done: true, value: undefined };
      }

      const value = events[index];
      index += 1;
      return { done: false, value };
    },
    async return() {
      state.closed = true;
      return { done: true, value: undefined };
    },
    async throw(error?: unknown) {
      state.closed = true;
      throw error;
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };

  return Object.assign(iterator, {
    state,
    interrupt: vi.fn(async () => {
      state.interrupted = true;
    }),
    close: vi.fn(() => {
      state.closed = true;
    }),
    setPermissionMode: vi.fn(async () => undefined),
    setModel: vi.fn(async () => undefined),
    setMaxThinkingTokens: vi.fn(async () => undefined),
    initializationResult: vi.fn(async () => ({})),
    supportedCommands: vi.fn(async () => []),
    supportedModels: vi.fn(async () => []),
    supportedAgents: vi.fn(async () => []),
    mcpServerStatus: vi.fn(async () => []),
    accountInfo: vi.fn(async () => ({})),
    rewindFiles: vi.fn(async () => ({ canRewind: false })),
    reconnectMcpServer: vi.fn(async () => undefined),
    toggleMcpServer: vi.fn(async () => undefined),
    setMcpServers: vi.fn(async () => ({ added: [], removed: [], errors: [] })),
    streamInput: vi.fn(async () => undefined),
    stopTask: vi.fn(async () => undefined),
  }) as unknown as MockSdkSession;
}

export function createMockAgentRun(events: SDKMessage[] = MOCK_EVENTS.simpleTextReply) {
  const session = createMockSdkSession(events);
  const query = vi.fn(() => session);

  return {
    query,
    session,
    events,
  };
}
