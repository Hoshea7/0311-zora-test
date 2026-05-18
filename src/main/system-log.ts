import { formatDurationMs, truncateLogText } from "./agent-loop-log";
import { writeDiagnosticLog } from "./diagnostic-log";

export type SystemLogLevel = "info" | "warn" | "error";
export type SystemLogPhase = "pre" | "runtime" | "post";
export type SystemLogFields = Record<string, unknown>;

const MAX_FIELD_CHARS = 360;
const VERBOSE_LOG_ENV = "ZORA_SYSTEM_LOG_VERBOSE";

type SystemOperation = {
  log: (
    phase: SystemLogPhase,
    event: string,
    message: string,
    fields?: SystemLogFields,
    options?: { level?: SystemLogLevel; verbose?: boolean }
  ) => void;
  end: (
    status: string,
    message: string,
    fields?: SystemLogFields,
    options?: { level?: SystemLogLevel; verbose?: boolean }
  ) => void;
  elapsedMs: () => number;
};

function isVerboseSystemLog(): boolean {
  return process.env[VERBOSE_LOG_ENV] === "1";
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : String(error);
}

function normalizeFieldValue(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }

  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(truncateLogText(value, MAX_FIELD_CHARS));
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

function formatFields(fields?: SystemLogFields): string {
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

function writeLog(level: SystemLogLevel, line: string): void {
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

export function logSystemEvent(
  scope: string,
  component: string,
  event: string,
  message: string,
  fields?: SystemLogFields,
  options?: { level?: SystemLogLevel; verbose?: boolean }
): void {
  const level = options?.level ?? "info";
  if (options?.verbose && !isVerboseSystemLog()) {
    return;
  }

  writeDiagnosticLog({
    level,
    kind: "system",
    area: scope,
    component,
    event,
    message,
    fields,
  });

  const suffix = formatFields(fields);
  const line = `[${scope}][${component}][${event}] ${message}${suffix ? ` ${suffix}` : ""}`;
  writeLog(level, line);
}

export function startSystemOperation(
  scope: string,
  component: string,
  baseFields?: SystemLogFields
): SystemOperation {
  const startedAt = Date.now();
  let lastLoggedAt = startedAt;

  function elapsedParts(): { total: string; step: string; totalMs: number; stepMs: number } {
    const now = Date.now();
    const totalMs = Math.max(0, now - startedAt);
    const stepMs = Math.max(0, now - lastLoggedAt);
    lastLoggedAt = now;

    return {
      total: `+${formatDurationMs(totalMs) ?? "0ms"}`,
      step: formatDurationMs(stepMs) ?? "0ms",
      totalMs,
      stepMs,
    };
  }

  function writeOperationLog(
    phase: SystemLogPhase,
    event: string,
    message: string,
    fields?: SystemLogFields,
    options?: { level?: SystemLogLevel; verbose?: boolean }
  ): void {
    const level = options?.level ?? "info";
    if (options?.verbose && !isVerboseSystemLog()) {
      return;
    }

    const elapsed = elapsedParts();
    const mergedFields = { ...baseFields, ...fields };
    writeDiagnosticLog({
      level,
      kind: "system",
      area: scope,
      component,
      phase,
      event,
      message,
      elapsedMs: elapsed.totalMs,
      stepMs: elapsed.stepMs,
      fields: mergedFields,
    });

    const suffix = formatFields(mergedFields);
    const line = `[${elapsed.total}][step=${elapsed.step}][${scope}][${component}][${phase}][${event}] ${message}${suffix ? ` ${suffix}` : ""}`;
    writeLog(level, line);
  }

  return {
    log: writeOperationLog,
    end: (status, message, fields, options) =>
      writeOperationLog("post", "summary", message, { status, ...fields }, options),
    elapsedMs: () => Math.max(0, Date.now() - startedAt),
  };
}
