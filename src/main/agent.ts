import { app } from "electron";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentStatus, AgentStreamEvent } from "../shared/zora";
import type {
  PermissionRequest,
  AskUserRequest,
  AskUserQuestion,
} from "../shared/zora";

// ─── HITL: Promise + Map 异步挂起机制 ───

type PermissionResult =
  | { behavior: "allow"; updatedInput?: Record<string, unknown> }
  | { behavior: "deny"; message: string };

type PendingPermission = {
  resolve: (result: PermissionResult) => void;
  request: PermissionRequest;
};

type PendingAskUser = {
  resolve: (result: PermissionResult) => void;
  request: AskUserRequest;
};

const pendingPermissions = new Map<string, PendingPermission>();
const pendingAskUsers = new Map<string, PendingAskUser>();

let hitlIdCounter = 0;
function nextHitlId(prefix: string): string {
  hitlIdCounter += 1;
  return `${prefix}-${Date.now()}-${hitlIdCounter}`;
}

type JsonRecord = Record<string, unknown>;
type AgentEventForwarder = (event: AgentStreamEvent) => void;

type ClaudeAgentChatConfig = {
  cwd: string;
  prompt: string;
  onEvent?: AgentEventForwarder;
};

type ActiveAgentRun = {
  query: {
    interrupt: () => Promise<void>;
    close: () => void;
  };
  stopping: boolean;
};

let activeAgentRun: ActiveAgentRun | null = null;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function stringifyContent(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value === undefined) {
    return "";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function extractAssistantContent(message: unknown): string {
  if (!isRecord(message)) {
    return stringifyContent(message);
  }

  const content = message.content;
  if (!Array.isArray(content)) {
    return stringifyContent(message);
  }

  return content
    .map((block) => {
      if (!isRecord(block)) {
        return stringifyContent(block);
      }

      if (block.type === "text" && typeof block.text === "string") {
        return block.text;
      }

      return stringifyContent(block);
    })
    .filter(Boolean)
    .join("\n");
}

function extractStreamContent(event: unknown): string {
  if (!isRecord(event)) {
    return stringifyContent(event);
  }

  if (event.type === "content_block_delta") {
    const delta = isRecord(event.delta) ? event.delta : undefined;

    if (delta?.type === "text_delta" && typeof delta.text === "string") {
      return delta.text;
    }

    return stringifyContent(delta);
  }

  if (event.type === "content_block_start") {
    return stringifyContent(event.content_block);
  }

  if (event.type === "message_delta") {
    return stringifyContent(event.delta);
  }

  return stringifyContent(event);
}

function emitAgentStatus(status: AgentStatus, onEvent?: AgentEventForwarder) {
  onEvent?.({
    type: "agent_status",
    status
  });
}

function emitAgentError(error: unknown, onEvent?: AgentEventForwarder) {
  const payload = {
    type: "agent_error",
    error: error instanceof Error ? error.message : stringifyContent(error)
  } as const;

  console.error("[agent] Claude Agent SDK chat failed.");
  console.error(error);
  onEvent?.(payload);
}

function logSdkMessage(message: SDKMessage, onEvent?: AgentEventForwarder) {
  onEvent?.(message as AgentStreamEvent);

  if (message.type === "stream_event") {
    const event = message.event;
    const eventType = isRecord(event) && typeof event.type === "string" ? event.type : "unknown";
    const content = extractStreamContent(event);
    console.log(`[agent][stream_event:${eventType}]`, content);
    return;
  }

  if (message.type === "assistant") {
    console.log("[agent][assistant]", extractAssistantContent(message.message));
    return;
  }

  if (message.type === "result") {
    const subtype = typeof message.subtype === "string" ? message.subtype : "unknown";
    const content =
      message.subtype === "success"
        ? message.result
        : Array.isArray(message.errors)
          ? message.errors.join(" | ")
          : stringifyContent(message);

    console.log(`[agent][result:${subtype}]`, content);
    return;
  }

  if (message.type === "system") {
    const subtype = typeof message.subtype === "string" ? message.subtype : "unknown";
    const content =
      subtype === "init" && "model" in message
        ? `session=${stringifyContent(message.session_id)} model=${stringifyContent(message.model)}`
        : stringifyContent(message);

    console.log(`[agent][system:${subtype}]`, content);
    return;
  }

  if (message.type === "auth_status") {
    const output = Array.isArray(message.output) ? message.output.join("\n") : "";
    const error = typeof message.error === "string" ? ` error=${message.error}` : "";
    console.log("[agent][auth_status]", `${output}${error}`.trim());
    return;
  }

  console.log(`[agent][${message.type}]`, stringifyContent(message));
}

function resolveSDKCliPath(): string {
  let cliPath: string | null = null;

  try {
    const cjsRequire = createRequire(__filename);
    const sdkEntryPath = cjsRequire.resolve("@anthropic-ai/claude-agent-sdk");
    cliPath = join(dirname(sdkEntryPath), "cli.js");
    console.log(`[agent] SDK CLI path (createRequire): ${cliPath}`);
  } catch (error) {
    console.warn("[agent] createRequire failed to resolve SDK CLI path.", error);
  }

  if (!cliPath) {
    try {
      cliPath = join(
        dirname(require.resolve("@anthropic-ai/claude-agent-sdk")),
        "cli.js"
      );
      console.log(`[agent] SDK CLI path (require.resolve): ${cliPath}`);
    } catch (error) {
      console.warn("[agent] require.resolve failed to resolve SDK CLI path.", error);
    }
  }

  if (!cliPath) {
    cliPath = join(
      process.cwd(),
      "node_modules",
      "@anthropic-ai",
      "claude-agent-sdk",
      "cli.js"
    );
    console.log(`[agent] SDK CLI path (fallback): ${cliPath}`);
  }

  if (app.isPackaged && cliPath.includes(".asar")) {
    cliPath = cliPath.replace(/\.asar([/\\])/, ".asar.unpacked$1");
    console.log(`[agent] SDK CLI path (asar.unpacked): ${cliPath}`);
  }

  return cliPath;
}

// ─── HITL 辅助函数 ───

const READ_ONLY_TOOLS = new Set([
  "Read", "ReadFile", "Search", "Grep", "Glob", "LS",
  "ListDirectory", "View", "Cat",
]);

function isReadOnlyTool(toolName: string): boolean {
  return READ_ONLY_TOOLS.has(toolName);
}

function buildDescription(toolName: string, input: Record<string, unknown>): string {
  if (toolName === "Bash" || toolName.toLowerCase().includes("bash")) {
    const cmd = typeof input.command === "string" ? input.command : "";
    return cmd ? `执行命令: ${cmd.slice(0, 120)}` : "执行 Bash 命令";
  }
  if (
    toolName === "Write" ||
    toolName === "Edit" ||
    toolName.toLowerCase().includes("write")
  ) {
    const filePath =
      typeof input.filePath === "string"
        ? input.filePath
        : typeof input.file_path === "string"
          ? input.file_path
          : "";
    return filePath ? `写入文件: ${filePath}` : "写入文件";
  }
  return `使用工具: ${toolName}`;
}

function parseAskUserQuestions(
  input: Record<string, unknown>
): AskUserQuestion[] {
  if (typeof input.question === "string") {
    return [{ question: input.question }];
  }
  if (Array.isArray(input.questions)) {
    return input.questions.map((q: unknown) => {
      if (typeof q === "string") return { question: q };
      if (isRecord(q) && typeof q.question === "string") {
        return {
          question: q.question,
          options: Array.isArray(q.options) ? q.options : undefined,
        };
      }
      return { question: stringifyContent(q) };
    });
  }
  return [{ question: stringifyContent(input) }];
}

function createCanUseTool(onEvent?: AgentEventForwarder) {
  return async (
    toolName: string,
    input: Record<string, unknown>,
    options: { signal?: AbortSignal; toolUseID?: string; agentID?: string }
  ): Promise<PermissionResult> => {
    // 1. 拦截 AskUserQuestion 工具
    if (toolName === "AskUserQuestion") {
      const requestId = nextHitlId("ask");
      const request: AskUserRequest = {
        requestId,
        questions: parseAskUserQuestions(input),
        toolInput: input,
      };
      onEvent?.({ type: "ask_user_request", request });

      return new Promise<PermissionResult>((resolve) => {
        pendingAskUsers.set(requestId, { resolve, request });
        options.signal?.addEventListener(
          "abort",
          () => {
            if (pendingAskUsers.has(requestId)) {
              pendingAskUsers.delete(requestId);
              resolve({ behavior: "deny", message: "操作已中止" });
            }
          },
          { once: true }
        );
      });
    }

    // 2. 只读工具自动放行
    if (isReadOnlyTool(toolName)) {
      return { behavior: "allow", updatedInput: input };
    }

    // 3. 需要用户确认：挂起 Promise
    const requestId = nextHitlId("perm");
    const command =
      (toolName === "Bash" || toolName.toLowerCase().includes("bash")) &&
      typeof input.command === "string"
        ? input.command
        : undefined;
    const request: PermissionRequest = {
      requestId,
      toolName,
      toolInput: input,
      description: buildDescription(toolName, input),
      command,
    };
    onEvent?.({ type: "permission_request", request });

    return new Promise<PermissionResult>((resolve) => {
      pendingPermissions.set(requestId, { resolve, request });
      options.signal?.addEventListener(
        "abort",
        () => {
          if (pendingPermissions.has(requestId)) {
            pendingPermissions.delete(requestId);
            resolve({ behavior: "deny", message: "操作已中止" });
          }
        },
        { once: true }
      );
    });
  };
}

function isAbortLikeError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || /aborted/i.test(error.message))
  );
}

export function isClaudeAgentRunning() {
  return activeAgentRun !== null;
}

export async function runClaudeAgentChat({
  cwd,
  prompt,
  onEvent
}: ClaudeAgentChatConfig) {
  if (activeAgentRun) {
    throw new Error("Claude Agent is already running.");
  }

  console.log("[agent] Starting Claude Agent SDK chat...");

  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  const sdkCliPath = resolveSDKCliPath();
  const executable = "node";
  const executableArgs: string[] = [];
  const sdkEnv = {
    ...process.env,
    CLAUDE_AGENT_SDK_CLIENT_APP: "zora-agent"
  };

  console.log(`[agent] Using SDK CLI: ${sdkCliPath}`);
  console.log(`[agent] Using runtime: ${executable}`);
  console.log(`[agent] API KEY: api key from ~/.claude global setting`);
  console.log("[agent] Query env:", {
    claudeAgentSdkClientApp: sdkEnv.CLAUDE_AGENT_SDK_CLIENT_APP ?? "(empty)",
    sdkCliPath,
    executable,
    executableArgs
  });

  const response = query({
    prompt,
    options: {
      cwd,
      pathToClaudeCodeExecutable: sdkCliPath,
      executable,
      executableArgs,
      maxTurns: 30,
      persistSession: false,
      includePartialMessages: true,
      env: sdkEnv,
      canUseTool: createCanUseTool(onEvent),
    }
  });

  const run: ActiveAgentRun = {
    query: response,
    stopping: false
  };
  activeAgentRun = run;
  emitAgentStatus("started", onEvent);

  void (async () => {
    try {
      for await (const message of response) {
        logSdkMessage(message, onEvent);
      }

      console.log("[agent] Claude Agent SDK chat finished.");
      emitAgentStatus(run.stopping ? "stopped" : "finished", onEvent);
    } catch (error) {
      if (!run.stopping || !isAbortLikeError(error)) {
        emitAgentError(error, onEvent);
      }

      emitAgentStatus(run.stopping ? "stopped" : "finished", onEvent);
    } finally {
      try {
        response.close();
      } catch {
        // Ignore close errors while tearing down a finished or aborted run.
      }

      // 清理所有挂起的 HITL 请求
      for (const [, p] of pendingPermissions) {
        p.resolve({ behavior: "deny", message: "会话已结束" });
      }
      pendingPermissions.clear();
      for (const [, p] of pendingAskUsers) {
        p.resolve({ behavior: "deny", message: "会话已结束" });
      }
      pendingAskUsers.clear();

      if (activeAgentRun === run) {
        activeAgentRun = null;
      }
    }
  })();
}

export async function stopClaudeAgentChat() {
  if (!activeAgentRun) {
    return;
  }

  const run = activeAgentRun;
  run.stopping = true;

  try {
    await run.query.interrupt();
  } catch (error) {
    if (!isAbortLikeError(error)) {
      console.warn("[agent] Failed to interrupt Claude Agent SDK chat.", error);
    }
  } finally {
    try {
      run.query.close();
    } catch (error) {
      console.warn("[agent] Failed to close Claude Agent SDK chat.", error);
    }
  }
}

// ─── HITL 响应函数（从 IPC handler 调用） ───

export function respondToPermission(
  requestId: string,
  behavior: "allow" | "deny",
  _alwaysAllow: boolean,
  userMessage?: string
) {
  const pending = pendingPermissions.get(requestId);
  if (!pending) return;

  if (behavior === "allow") {
    pending.resolve({ behavior: "allow", updatedInput: pending.request.toolInput });
  } else {
    const baseMsg = "用户拒绝了此操作";
    const message = userMessage ? `${baseMsg}：${userMessage}` : baseMsg;
    pending.resolve({ behavior: "deny", message });
  }
  pendingPermissions.delete(requestId);
}

export function respondToAskUser(
  requestId: string,
  answers: Record<string, string>
) {
  const pending = pendingAskUsers.get(requestId);
  if (!pending) return;

  pending.resolve({
    behavior: "allow",
    updatedInput: { ...pending.request.toolInput, answers },
  });
  pendingAskUsers.delete(requestId);
}
