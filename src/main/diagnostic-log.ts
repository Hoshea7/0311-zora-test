import { appendFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { ZORA_DIR } from "./utils/fs";

export type DiagnosticLogLevel = "info" | "warn" | "error";

export type DiagnosticLogRecord = {
  level: DiagnosticLogLevel;
  kind: "agent" | "system";
  message: string;
  runId?: string;
  sessionId?: string;
  workspaceId?: string;
  source?: string;
  event?: string;
  phase?: string;
  area?: string;
  component?: string;
  agentType?: string;
  elapsedMs?: number;
  stepMs?: number;
  fields?: Record<string, unknown>;
};

const LOG_RETENTION_DAYS = 14;
const MAX_STRING_CHARS = 20_000;
const MAX_ARRAY_ITEMS = 80;
const MAX_OBJECT_KEYS = 120;
const MAX_DEPTH = 8;

export const ZORA_LOGS_DIR = path.join(ZORA_DIR, "logs");

let writeQueue: Promise<void> = Promise.resolve();
let ensureLogsDirPromise: Promise<void> | null = null;
let cleanupStarted = false;
let forceTestDiagnosticFileLog = false;

function isDiagnosticFileLogEnabled(): boolean {
  if (process.env.ZORA_DIAGNOSTIC_LOG_DISABLED === "1") {
    return false;
  }

  if (
    process.env.NODE_ENV === "test" &&
    !forceTestDiagnosticFileLog
  ) {
    return false;
  }

  return true;
}

function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMainLogPath(date = new Date()): string {
  return path.join(ZORA_LOGS_DIR, `zora-${getLocalDateKey(date)}.jsonl`);
}

function getErrorLogPath(date = new Date()): string {
  return path.join(ZORA_LOGS_DIR, `zora-error-${getLocalDateKey(date)}.jsonl`);
}

function isSensitiveKey(key: string): boolean {
  return /(^|[_-])(api[_-]?key|token|secret|password|authorization|cookie|credential|private[_-]?key|access[_-]?token|refresh[_-]?token)($|[_-])/i.test(
    key
  );
}

function redactString(value: string): string {
  return value
    .replace(
      /-----BEGIN [^-]+PRIVATE KEY-----[\s\S]*?-----END [^-]+PRIVATE KEY-----/g,
      "[REDACTED_PRIVATE_KEY]"
    )
    .replace(
      /\bAuthorization\s*[:=]\s*Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
      "Authorization: Bearer [REDACTED]"
    )
    .replace(
      /\bAuthorization\s*[:=]\s*(?!Bearer\b)[A-Za-z0-9._~+/=-]+/gi,
      "Authorization: [REDACTED]"
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(
      /\b(sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{12,}|AIza[0-9A-Za-z_-]{12,})\b/g,
      "[REDACTED_TOKEN]"
    )
    .replace(
      /(["']?(?:api[_-]?key|token|secret|password|access[_-]?token|refresh[_-]?token)["']?\s*[:=]\s*["']?)([^"',\s}]+)/gi,
      "$1[REDACTED]"
    )
    .replace(
      /([?&](?:api[_-]?key|token|secret|password|code|access_token|refresh_token)=)[^&#\s]+/gi,
      "$1[REDACTED]"
    );
}

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_CHARS) {
    return value;
  }

  const headChars = Math.floor(MAX_STRING_CHARS * 0.6);
  const tailChars = MAX_STRING_CHARS - headChars;
  const omittedChars = value.length - headChars - tailChars;
  return `${value.slice(0, headChars)}\n...[truncated ${omittedChars} chars]...\n${value.slice(-tailChars)}...(${value.length} chars)`;
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return truncateString(redactString(value));
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncateString(redactString(value.message)),
      stack: value.stack ? truncateString(redactString(value.stack)) : undefined,
    };
  }

  if (depth >= MAX_DEPTH) {
    return "[MaxDepth]";
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeValue(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`...(${value.length - MAX_ARRAY_ITEMS} more items)`);
    }
    return items;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS);
    const output: Record<string, unknown> = {};
    for (const [key, item] of entries) {
      output[key] = isSensitiveKey(key) ? "[REDACTED]" : sanitizeValue(item, depth + 1);
    }

    const totalKeys = Object.keys(value as Record<string, unknown>).length;
    if (totalKeys > MAX_OBJECT_KEYS) {
      output.__truncatedKeys = totalKeys - MAX_OBJECT_KEYS;
    }
    return output;
  }

  return truncateString(redactString(String(value)));
}

function sanitizeRecord(record: DiagnosticLogRecord): Record<string, unknown> {
  return {
    ts: new Date().toISOString(),
    pid: process.pid,
    level: record.level,
    kind: record.kind,
    runId: record.runId,
    sessionId: record.sessionId,
    workspaceId: record.workspaceId,
    source: record.source,
    area: record.area,
    component: record.component,
    agentType: record.agentType,
    phase: record.phase,
    event: record.event,
    message: sanitizeValue(record.message),
    elapsedMs: record.elapsedMs,
    stepMs: record.stepMs,
    fields: sanitizeValue(record.fields),
  };
}

async function cleanupOldLogs(): Promise<void> {
  const cutoffMs = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let fileNames: string[];
  try {
    fileNames = await readdir(ZORA_LOGS_DIR);
  } catch {
    return;
  }

  await Promise.all(
    fileNames.map(async (fileName) => {
      const match = /^zora(?:-error)?-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(fileName);
      if (!match) {
        return;
      }

      const fileTime = new Date(`${match[1]}T00:00:00`).getTime();
      if (Number.isFinite(fileTime) && fileTime < cutoffMs) {
        await rm(path.join(ZORA_LOGS_DIR, fileName), { force: true });
      }
    })
  );
}

async function appendJsonLine(filePath: string, line: string): Promise<void> {
  ensureLogsDirPromise ??= mkdir(ZORA_LOGS_DIR, { recursive: true })
    .then(() => undefined)
    .catch((error) => {
      ensureLogsDirPromise = null;
      throw error;
    });
  await ensureLogsDirPromise;

  if (!cleanupStarted) {
    cleanupStarted = true;
    void cleanupOldLogs().catch(() => {
      // Diagnostics must never break the app path.
    });
  }
  await appendFile(filePath, line, "utf8");
}

function enqueueWrite(filePath: string, line: string): void {
  writeQueue = writeQueue
    .then(() => appendJsonLine(filePath, line))
    .catch((error) => {
      console.warn("[diagnostic-log] Failed to write diagnostic log.", error);
    });
}

export function writeDiagnosticLog(record: DiagnosticLogRecord): void {
  if (!isDiagnosticFileLogEnabled()) {
    return;
  }

  const line = `${JSON.stringify(sanitizeRecord(record))}\n`;
  enqueueWrite(getMainLogPath(), line);

  if (record.level === "warn" || record.level === "error") {
    enqueueWrite(getErrorLogPath(), line);
  }
}

export async function flushDiagnosticLogWrites(): Promise<void> {
  await writeQueue;
}

export function enableDiagnosticFileLogForTests(): void {
  forceTestDiagnosticFileLog = true;
}
