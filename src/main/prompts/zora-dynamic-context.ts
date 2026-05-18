import {
  loadFile,
  loadRecentLogs,
  migrateLegacyMemoryIfNeeded,
} from "../memory-store";
import { getErrorMessage, logSystemEvent } from "../system-log";

function padNumber(value: number) {
  return value.toString().padStart(2, "0");
}

function formatLocalHour(date = new Date()) {
  return [
    `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`,
    `${padNumber(date.getHours())}:00`,
  ].join(" ");
}

function getLocalTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";
}

function escapeXmlText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function buildMemorySection(
  userContent: string | null,
  memoryContent: string | null,
  recentLogs: string | null
) {
  const parts: string[] = [];

  if (userContent?.trim()) {
    parts.push(`<file name="USER.md">\n${escapeXmlText(userContent.trim())}\n</file>`);
  }

  if (memoryContent?.trim()) {
    parts.push(`<file name="MEMORY.md">\n${escapeXmlText(memoryContent.trim())}\n</file>`);
  }

  if (recentLogs?.trim()) {
    parts.push(`<recent_daily_logs>\n${escapeXmlText(recentLogs.trim())}\n</recent_daily_logs>`);
  }

  if (parts.length === 0) {
    return "    当前没有注入的长期记忆。";
  }

  return parts
    .map((part) =>
      part
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n")
    )
    .join("\n\n");
}

export async function buildZoraDynamicContext(
  workspaceId?: string,
  workingDirectory?: string
): Promise<string> {
  try {
    await migrateLegacyMemoryIfNeeded();
  } catch (error) {
    logSystemEvent(
      "agent",
      "dynamic-context",
      "memory:migrate:error",
      "构建动态上下文时迁移旧版记忆失败",
      { error: getErrorMessage(error) },
      { level: "error" }
    );
  }

  const [userContent, memoryContent, recentLogs] = await Promise.all([
    loadFile("USER.md"),
    loadFile("MEMORY.md"),
    loadRecentLogs(2),
  ]);

  return [
    "<zora_dynamic_context>",
    "  <current_context>",
    `    <local_time granularity="hour">${formatLocalHour()}</local_time>`,
    `    <timezone>${escapeXmlText(getLocalTimezone())}</timezone>`,
    workspaceId
      ? `    <current_workspace_id>${escapeXmlText(workspaceId)}</current_workspace_id>`
      : "",
    workingDirectory
      ? `    <current_working_directory>${escapeXmlText(workingDirectory)}</current_working_directory>`
      : "",
    "  </current_context>",
    "  <memory>",
    buildMemorySection(userContent, memoryContent, recentLogs),
    "  </memory>",
    "</zora_dynamic_context>",
  ].filter((line) => line.length > 0).join("\n");
}

export async function buildZoraPrompt(
  rawUserPrompt: string,
  workspaceId?: string,
  workingDirectory?: string
): Promise<string> {
  return `${await buildZoraDynamicContext(workspaceId, workingDirectory)}\n\n${rawUserPrompt}`;
}
