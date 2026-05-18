import type {
  AgentStreamEvent,
  AskUserQuestion,
  AskUserRequest,
  PermissionMode,
  PermissionRequest,
} from "../shared/zora";
import { isSafeBuiltinMcpToolName } from "../shared/types/mcp";
import { logAgentEvent, truncateLogText } from "./agent-loop-log";
import { ZORA_SCHEDULE_MANAGE_FULL_TOOL_NAME } from "./builtin-mcp/schedule";

type PermissionResult =
  | { behavior: "allow"; updatedInput?: Record<string, unknown> }
  | { behavior: "deny"; message: string };

interface CanUseToolOptions {
  signal: AbortSignal;
  suggestions?: unknown[];
  blockedPath?: string;
  decisionReason?: string;
  toolUseID: string;
  agentID?: string;
}

type PendingPermission = {
  resolve: (result: PermissionResult) => void;
  request: PermissionRequest;
  sessionId: string;
};

type PendingAskUser = {
  resolve: (result: PermissionResult) => void;
  request: AskUserRequest;
};

interface SessionWhitelist {
  allowedTools: Set<string>;
  allowedBashCommands: Set<string>;
}

type JsonRecord = Record<string, unknown>;
type AgentEventForwarder = (event: AgentStreamEvent) => void;

const pendingPermissions = new Map<string, PendingPermission>();
const pendingAskUsers = new Map<string, PendingAskUser>();
const sessionWhitelists = new Map<string, SessionWhitelist>();

let currentPermissionMode: PermissionMode = "ask";

const SAFE_TOOLS = new Set([
  "Read", "Glob", "Grep", "WebSearch", "WebFetch",
  "TodoRead", "TodoWrite", "TaskOutput",
  "ListMcpResources", "ReadMcpResource", "ExitPlanMode",
]);

const SMART_AUTO_ALLOW_TOOLS = new Set([
  "Write", "Edit", "MultiEdit", "NotebookEdit",
  "Agent",
  "Task", "TaskStop",
]);

const BLOCKED_SCHEDULE_FALLBACK_TOOLS = new Set([
  "cron",
  "croncreate",
  "cronupdate",
  "crondelete",
  "cronlist",
  "cronget",
]);

const READ_ONLY_SCHEDULE_ACTIONS = new Set(["list", "get"]);

const SAFE_BASH_PATTERNS = [
  /^git\s+(status|log|diff|show|branch|remote|tag)\b/,
  /^ls\b/, /^head\b/, /^tail\b/, /^grep\b/, /^rg\b/,
  /^which\b/, /^pwd$/, /^env$/, /^whoami$/,
  /^cat\b/, /^echo\b/, /^tree\b/, /^wc\b/, /^file\b/,
  /^node\s+--version$/, /^bun\s+--version$/,
  /^npm\s+(list|ls|view|info|outdated)\b/,
];

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

function summarizeToolInput(input: Record<string, unknown>) {
  return {
    keys: Object.keys(input),
    preview: stringifyContent(input).slice(0, 300),
  };
}

function summarizeToolForLog(
  toolName: string,
  toolUseID: string,
  input: Record<string, unknown>
) {
  return {
    tool: toolName,
    toolUseId: toolUseID,
    command: typeof input.command === "string" ? truncateLogText(input.command, 240) : undefined,
    file:
      typeof input.file_path === "string"
        ? input.file_path
        : typeof input.path === "string"
          ? input.path
          : undefined,
  };
}

function extractBaseCommand(input: Record<string, unknown>): string | null {
  if (typeof input.command !== "string") {
    return null;
  }

  const words = input.command.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return null;
  }

  return words.slice(0, 2).join(" ");
}

function isDangerousCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) {
    return false;
  }

  return [
    /(^|[\s;&|])sudo(\s|$)/,
    /\brm\s+-(?=[^\s]*r)(?=[^\s]*f)[^\s]*\s+\/(?:\s|$|[*;&|])/,
    /\bdd\b[\s\S]*\bof=/,
    /\bmkfs(?:\.[A-Za-z0-9_-]+)?\b/,
    />{1,2}\s*\/dev\//,
  ].some((pattern) => pattern.test(trimmed));
}

function getSessionWhitelist(sessionId: string): SessionWhitelist {
  let whitelist = sessionWhitelists.get(sessionId);
  if (!whitelist) {
    whitelist = {
      allowedTools: new Set<string>(),
      allowedBashCommands: new Set<string>(),
    };
    sessionWhitelists.set(sessionId, whitelist);
  }
  return whitelist;
}

function isWhitelisted(
  sessionId: string,
  toolName: string,
  input: Record<string, unknown>
): boolean {
  const whitelist = sessionWhitelists.get(sessionId);
  if (!whitelist) {
    return false;
  }

  if (toolName !== "Bash") {
    return whitelist.allowedTools.has(toolName);
  }

  const command = typeof input.command === "string" ? input.command : "";
  if (isDangerousCommand(command)) {
    logAgentEvent("runtime", "hitl:deny", "工具权限被拒绝", {
      tool: toolName,
      reason: "dangerous_whitelisted_bash",
      command: truncateLogText(command, 200),
    });
    return false;
  }

  const baseCommand = extractBaseCommand(input);
  return baseCommand !== null && whitelist.allowedBashCommands.has(baseCommand);
}

function addToWhitelist(
  sessionId: string,
  toolName: string,
  input: Record<string, unknown>
): void {
  const whitelist = getSessionWhitelist(sessionId);

  if (toolName === "Bash") {
    const command = typeof input.command === "string" ? input.command : "";
    if (isDangerousCommand(command)) {
      logAgentEvent(
        "runtime",
        "hitl:whitelist",
        "权限白名单跳过",
        {
          tool: toolName,
          reason: "dangerous_bash",
          command: truncateLogText(command, 200),
        },
        { verbose: true }
      );
      return;
    }

    const baseCommand = extractBaseCommand(input);
    if (!baseCommand) {
      logAgentEvent(
        "runtime",
        "hitl:whitelist",
        "权限白名单跳过",
        {
          tool: toolName,
          reason: "missing_base_command",
        },
        { verbose: true }
      );
      return;
    }

    whitelist.allowedBashCommands.add(baseCommand);
    logAgentEvent(
      "runtime",
      "hitl:whitelist",
      "权限白名单已更新",
      {
        tool: toolName,
        baseCommand,
      },
      { verbose: true }
    );
    return;
  }

  whitelist.allowedTools.add(toolName);
  logAgentEvent(
    "runtime",
    "hitl:whitelist",
    "权限白名单已更新",
    {
      tool: toolName,
    },
    { verbose: true }
  );
}

export function clearSessionWhitelist(sessionId: string): void {
  if (sessionWhitelists.delete(sessionId)) {
    logAgentEvent(
      "runtime",
      "hitl:whitelist",
      "权限白名单已清理",
      undefined,
      { verbose: true }
    );
  }
}

function isSafeBashCommand(command: string): boolean {
  const trimmed = command.trim();
  if (/[|;&]|>{1,2}|\$\(|`/.test(trimmed)) {
    return false;
  }
  return SAFE_BASH_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function getTerminalToolName(toolName: string): string {
  const cleaned = toolName.replace(/^default_api:/, "").trim();
  const parts = cleaned.split("__").filter(Boolean);
  return (parts[parts.length - 1] ?? cleaned).toLowerCase();
}

function isBlockedScheduleFallbackTool(toolName: string): boolean {
  return BLOCKED_SCHEDULE_FALLBACK_TOOLS.has(getTerminalToolName(toolName));
}

function isReadOnlyScheduleManageInput(input: Record<string, unknown>): boolean {
  return (
    typeof input.action === "string" &&
    READ_ONLY_SCHEDULE_ACTIONS.has(input.action)
  );
}

function isAutoAllowedTool(toolName: string, input: Record<string, unknown>): boolean {
  if (SAFE_TOOLS.has(toolName)) {
    return true;
  }

  if (isSafeBuiltinMcpToolName(toolName)) {
    return true;
  }

  if (toolName === ZORA_SCHEDULE_MANAGE_FULL_TOOL_NAME) {
    return isReadOnlyScheduleManageInput(input);
  }

  if (toolName === "Bash") {
    const command = typeof input.command === "string" ? input.command : "";
    return isSafeBashCommand(command);
  }

  return false;
}

function buildDescription(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case "Bash":
      return typeof input.command === "string"
        ? `执行命令: ${input.command.slice(0, 200)}`
        : "执行 Bash 命令";
    case "Write":
      return typeof input.file_path === "string"
        ? `写入文件: ${input.file_path}`
        : "写入文件";
    case "Edit":
      return typeof input.file_path === "string"
        ? `编辑文件: ${input.file_path}`
        : "编辑文件";
    case "Task":
    case "Agent":
      return typeof input.description === "string"
        ? `启动子任务: ${input.description}`
        : "启动子任务";
    default:
      return `使用工具: ${toolName}`;
  }
}

function parseAskUserQuestions(input: Record<string, unknown>): AskUserQuestion[] {
  if (typeof input.question === "string") {
    return [{ question: input.question }];
  }

  if (Array.isArray(input.questions)) {
    return input.questions.map((q: unknown) => {
      if (typeof q === "string") {
        return { question: q };
      }

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

export function getPermissionMode(): PermissionMode {
  return currentPermissionMode;
}

export function setPermissionMode(mode: PermissionMode) {
  currentPermissionMode = mode;
}

export function createCanUseTool(
  onEvent: AgentEventForwarder,
  sessionId: string
) {
  return async (
    toolName: string,
    input: Record<string, unknown>,
    options: CanUseToolOptions
  ): Promise<PermissionResult> => {
    const withSession = (fields: Record<string, unknown> = {}) => ({
      session: sessionId,
      ...fields,
    });
    const allow = (): PermissionResult => ({
      behavior: "allow",
      updatedInput: input,
    });

    logAgentEvent(
      "runtime",
      "hitl:check",
      "检查工具权限",
      withSession({
        ...summarizeToolForLog(toolName, options.toolUseID, input),
        permissionMode: currentPermissionMode,
        agentId: options.agentID,
      }),
      { verbose: true }
    );

    if (toolName === "AskUserQuestion") {
      const requestId = crypto.randomUUID();
      const request: AskUserRequest = {
        requestId,
        questions: parseAskUserQuestions(input),
        toolInput: input,
      };
      logAgentEvent("runtime", "hitl:ask", "等待用户回答", withSession({
        requestId,
        tool: toolName,
        questionCount: request.questions.length,
      }));
      onEvent({ type: "ask_user_request", request });

      return new Promise<PermissionResult>((resolve) => {
        pendingAskUsers.set(requestId, { resolve, request });

        const handleAbort = () => {
          logAgentEvent(
            "runtime",
            "hitl:abort",
            "用户提问中止",
            withSession({ requestId, tool: toolName })
          );
          if (pendingAskUsers.has(requestId)) {
            pendingAskUsers.delete(requestId);
          }
          resolve({ behavior: "deny", message: "操作已中止" });
        };

        if (options.signal.aborted) {
          handleAbort();
          return;
        }

        options.signal.addEventListener("abort", handleAbort, { once: true });
      });
    }

    if (options.signal.aborted) {
      logAgentEvent("runtime", "hitl:abort", "权限检查中止", withSession({
        ...summarizeToolForLog(toolName, options.toolUseID, input),
      }));
      return { behavior: "deny", message: "操作已中止" };
    }

    if (isBlockedScheduleFallbackTool(toolName)) {
      logAgentEvent("runtime", "hitl:deny", "工具权限被拒绝", withSession({
        ...summarizeToolForLog(toolName, options.toolUseID, input),
        reason: "blocked_schedule_fallback_tool",
      }));
      return {
        behavior: "deny",
        message:
          "Zora 的定时任务必须使用 mcp__zora_schedule__zora_schedule_manage。不要使用 CronCreate、Claude Code cron 或其他临时 cron 工具；如果参数校验失败，请修正 zora_schedule_manage 参数后重试。",
      };
    }

    if (options.agentID && toolName !== ZORA_SCHEDULE_MANAGE_FULL_TOOL_NAME) {
      logAgentEvent(
        "runtime",
        "hitl:auto",
        "工具权限自动允许",
        withSession({
          ...summarizeToolForLog(toolName, options.toolUseID, input),
          reason: "subagent_tool_call",
        }),
        { verbose: true }
      );
      return allow();
    }

    if (isAutoAllowedTool(toolName, input)) {
      logAgentEvent(
        "runtime",
        "hitl:auto",
        "工具权限自动允许",
        withSession({
          ...summarizeToolForLog(toolName, options.toolUseID, input),
          reason: "readonly",
        }),
        { verbose: true }
      );
      return allow();
    }

    if (isWhitelisted(sessionId, toolName, input)) {
      logAgentEvent(
        "runtime",
        "hitl:auto",
        "工具权限自动允许",
        withSession({
          ...summarizeToolForLog(toolName, options.toolUseID, input),
          reason: "session_whitelist",
        }),
        { verbose: true }
      );
      return allow();
    }

    if (currentPermissionMode === "yolo") {
      logAgentEvent(
        "runtime",
        "hitl:auto",
        "工具权限自动允许",
        withSession({
          ...summarizeToolForLog(toolName, options.toolUseID, input),
          reason: "permissionMode:yolo",
        }),
        { verbose: true }
      );
      return allow();
    }

    if (
      currentPermissionMode === "smart" &&
      SMART_AUTO_ALLOW_TOOLS.has(toolName)
    ) {
      logAgentEvent(
        "runtime",
        "hitl:auto",
        "工具权限自动允许",
        withSession({
          ...summarizeToolForLog(toolName, options.toolUseID, input),
          reason: "permissionMode:smart",
        }),
        { verbose: true }
      );
      return allow();
    }

    const requestId = crypto.randomUUID();
    const command =
      toolName === "Bash" && typeof input.command === "string"
        ? input.command
        : undefined;
    const request: PermissionRequest = {
      requestId,
      toolName,
      toolInput: input,
      description: buildDescription(toolName, input),
      command,
    };
    logAgentEvent("runtime", "hitl:request", "等待用户授权", withSession({
      requestId,
      ...summarizeToolForLog(toolName, options.toolUseID, input),
      description: request.description,
    }));
    onEvent({ type: "permission_request", request });

    return new Promise<PermissionResult>((resolve) => {
      pendingPermissions.set(requestId, { resolve, request, sessionId });

      const handleAbort = () => {
        logAgentEvent("runtime", "hitl:abort", "权限请求中止", withSession({
          requestId,
          ...summarizeToolForLog(toolName, options.toolUseID, input),
        }));
        if (pendingPermissions.has(requestId)) {
          pendingPermissions.delete(requestId);
        }
        resolve({ behavior: "deny", message: "操作已中止" });
      };

      if (options.signal.aborted) {
        handleAbort();
        return;
      }

      options.signal.addEventListener("abort", handleAbort, { once: true });
    });
  };
}

export function respondToPermission(
  requestId: string,
  behavior: "allow" | "deny",
  alwaysAllow: boolean,
  userMessage?: string
) {
  const pending = pendingPermissions.get(requestId);
  if (!pending) {
    logAgentEvent("runtime", "hitl:unknown", "收到未知权限响应", {
      requestId,
      behavior,
    });
    return;
  }

  logAgentEvent("runtime", "hitl:response", "用户授权已响应", {
    requestId,
    tool: pending.request.toolName,
    behavior,
    alwaysAllow,
    hasUserMessage: Boolean(userMessage?.trim()),
  });

  if (behavior === "allow") {
    if (alwaysAllow) {
      addToWhitelist(
        pending.sessionId,
        pending.request.toolName,
        pending.request.toolInput
      );
    }
    pending.resolve({
      behavior: "allow",
      updatedInput: pending.request.toolInput,
    });
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
  if (!pending) {
    logAgentEvent("runtime", "hitl:unknown", "收到未知用户回答", {
      requestId,
    });
    return;
  }

  logAgentEvent("runtime", "hitl:answer", "用户已回答", {
    requestId,
    answerKeys: Object.keys(answers),
  });

  pending.resolve({
    behavior: "allow",
    updatedInput: { ...pending.request.toolInput, answers },
  });
  pendingAskUsers.delete(requestId);
}

export function clearAllPending(): void {
  if (pendingPermissions.size > 0 || pendingAskUsers.size > 0) {
    logAgentEvent("runtime", "hitl:cleanup", "清理未完成 HITL 请求", {
      pendingPermissions: pendingPermissions.size,
      pendingAskUsers: pendingAskUsers.size,
    });
  }

  for (const [, p] of pendingPermissions) {
    p.resolve({ behavior: "deny", message: "会话已结束" });
  }
  pendingPermissions.clear();

  for (const [, p] of pendingAskUsers) {
    p.resolve({ behavior: "deny", message: "会话已结束" });
  }
  pendingAskUsers.clear();
}
