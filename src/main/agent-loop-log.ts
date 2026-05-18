import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { writeDiagnosticLog } from "./diagnostic-log";

type LogFieldValue = unknown;

type LogFields = Record<string, LogFieldValue>;

const MAX_FIELD_CHARS = 360;
const VERBOSE_LOG_ENV = "ZORA_AGENT_LOOP_LOG_VERBOSE";

export type AgentLogType = "productivity" | "memory";
export type AgentLogPhase = "pre" | "runtime" | "post";
type AgentLogLevel = "info" | "warn" | "error";

type LoopTiming = {
  runId: string;
  agentType: AgentLogType;
  sessionId?: string;
  workspaceId?: string;
  source?: string;
  startedAt: number;
  lastLoggedAt: number;
};

const agentLoopContext = new AsyncLocalStorage<LoopTiming>();
const activeLoopTimings = new Map<string, LoopTiming>();
const activeLoopCounts = new Map<AgentLogType, number>();

export function truncateLogText(value: string, maxChars = MAX_FIELD_CHARS): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}...(${value.length} chars)`;
}

export function formatDurationMs(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  if (value < 1000) {
    return `${Math.round(value)}ms`;
  }

  return `${(value / 1000).toFixed(2)}s`;
}

export function formatCostUsd(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return `$${value.toFixed(4)}`;
}

export function isVerboseAgentLoopLog(): boolean {
  return process.env[VERBOSE_LOG_ENV] === "1";
}

function getAgentType(agentName: string): AgentLogType {
  return agentName === "MemoryAgent" || agentName === "memory"
    ? "memory"
    : "productivity";
}

export function isAgentLoopActiveFor(agentType: AgentLogType): boolean {
  return (activeLoopCounts.get(agentType) ?? 0) > 0;
}

function normalizeFieldValue(value: LogFieldValue): string | null {
  if (value === undefined) {
    return null;
  }

  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(truncateLogText(value));
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify(String(value));
  }
}

function formatFields(fields?: LogFields): string {
  if (!fields) {
    return "";
  }

  return Object.entries(fields)
    .flatMap(([key, value]) => {
      const normalized = normalizeFieldValue(value);
      return normalized === null ? [] : `${key}=${normalized}`;
    })
    .join(" ");
}

function getShortId(value: string | undefined): string | undefined {
  return value ? value.slice(0, 8) : undefined;
}

function getContextFromFields(fields?: LogFields): LoopTiming | undefined {
  const sessionId =
    typeof fields?.session === "string"
      ? fields.session
      : typeof fields?.sessionId === "string"
        ? fields.sessionId
        : undefined;
  const runId = typeof fields?.runId === "string" ? fields.runId : undefined;

  if (runId) {
    return activeLoopTimings.get(runId);
  }

  if (sessionId) {
    for (const timing of activeLoopTimings.values()) {
      if (timing.sessionId === sessionId) {
        return timing;
      }
    }
  }

  return undefined;
}

function getActiveLoopStore(): LoopTiming | undefined {
  const store = agentLoopContext.getStore();
  return store && activeLoopTimings.get(store.runId) === store ? store : undefined;
}

function resolveLoopTiming(
  fields?: LogFields,
  runId?: string
): LoopTiming | undefined {
  if (runId) {
    return activeLoopTimings.get(runId);
  }

  const store = getActiveLoopStore();
  if (store) {
    return store;
  }

  return getContextFromFields(fields);
}

function getElapsedParts(timing?: LoopTiming): {
  total: string;
  step: string;
  totalMs: number;
  stepMs: number;
} {
  if (!timing) {
    return { total: "+0ms", step: "0ms", totalMs: 0, stepMs: 0 };
  }

  const now = Date.now();
  const totalMs = Math.max(0, now - timing.startedAt);
  const stepMs = Math.max(0, now - timing.lastLoggedAt);
  timing.lastLoggedAt = now;
  return {
    total: `+${formatDurationMs(totalMs) ?? "0ms"}`,
    step: formatDurationMs(stepMs) ?? "0ms",
    totalMs,
    stepMs,
  };
}

export function logAgentEvent(
  phase: AgentLogPhase,
  event: string,
  message: string,
  fields?: LogFields,
  options?: {
    verbose?: boolean;
    agentType?: AgentLogType;
    level?: AgentLogLevel;
    runId?: string;
  }
): void {
  const agentType = options?.agentType ?? getActiveLoopStore()?.agentType ?? "productivity";
  const timing = resolveLoopTiming(fields, options?.runId);
  if (options?.verbose && !isVerboseAgentLoopLog()) {
    return;
  }

  const elapsed = getElapsedParts(timing);
  const level = options?.level ?? "info";
  writeDiagnosticLog({
    level,
    kind: "agent",
    area: "agent",
    agentType,
    runId: timing?.runId,
    sessionId: timing?.sessionId,
    workspaceId: timing?.workspaceId,
    source: timing?.source,
    phase,
    event,
    message,
    elapsedMs: elapsed.totalMs,
    stepMs: elapsed.stepMs,
    fields,
  });

  const suffix = formatFields(fields);
  const contextPrefix = timing
    ? `[run=${getShortId(timing.runId)}]${timing.sessionId ? `[session=${getShortId(timing.sessionId)}]` : ""}`
    : "";
  const line = `[${elapsed.total}][step=${elapsed.step}][agent][${agentType}]${contextPrefix}[${phase}][${event}] ${message}${suffix ? ` ${suffix}` : ""}`;
  const consoleLine =
    event === "start"
      ? `\n──────── Agent Loop Start ────────\n${line}`
      : event === "summary"
        ? `${line}\n──────── Agent Loop End ────────`
        : line;
  if (level === "error") {
    console.error(consoleLine);
  } else if (level === "warn") {
    console.warn(consoleLine);
  } else {
    console.info(consoleLine);
  }
}

function pickFields(fields: LogFields | undefined, keys: string[]): LogFields {
  if (!fields) {
    return {};
  }

  return Object.fromEntries(
    keys
      .map((key) => [key, fields[key]] as const)
      .filter(([, value]) => value !== undefined)
  );
}

export function logAgentLoopStart(
  agentName: string,
  fields: LogFields
): void {
  const agentType = getAgentType(agentName);
  const now = Date.now();
  const runId = typeof fields.runId === "string" ? fields.runId : randomUUID();
  const timing: LoopTiming = {
    runId,
    agentType,
    sessionId: typeof fields.session === "string" ? fields.session : undefined,
    workspaceId: typeof fields.workspace === "string" ? fields.workspace : undefined,
    source: typeof fields.source === "string" ? fields.source : undefined,
    startedAt: now,
    lastLoggedAt: now,
  };
  activeLoopTimings.set(runId, timing);
  activeLoopCounts.set(agentType, (activeLoopCounts.get(agentType) ?? 0) + 1);
  agentLoopContext.enterWith(timing);

  const query =
    typeof fields.query === "string" && fields.query !== "memory extraction"
      ? fields.query
      : undefined;
  logAgentEvent(
    "pre",
    "start",
    agentType === "memory" ? "记忆任务开始" : "Agent 初始化",
    {
      ...pickFields(fields, ["session", "workspace", "source"]),
      query,
    },
    { agentType, runId }
  );
}

export function logAgentLoopEnd(
  agentName: string,
  fields: LogFields
): void {
  const agentType = getAgentType(agentName);
  const timing = resolveLoopTiming(fields);
  const { totalDuration, total, ...restFields } = fields;
  logAgentEvent(
    "post",
    "summary",
    agentType === "memory" ? "记忆任务完成" : "会话完成",
    {
      ...restFields,
      total: totalDuration ?? total,
    },
    {
      agentType,
      runId: timing?.runId,
      level: fields.status === "error" ? "error" : "info",
    }
  );

  if (timing) {
    activeLoopTimings.delete(timing.runId);
    const nextCount = Math.max(0, (activeLoopCounts.get(agentType) ?? 1) - 1);
    if (nextCount === 0) {
      activeLoopCounts.delete(agentType);
    } else {
      activeLoopCounts.set(agentType, nextCount);
    }
  }
}

export function formatAgentName(profileName: string): string {
  return profileName === "memory" ? "MemoryAgent" : "ProductivityAgent";
}
