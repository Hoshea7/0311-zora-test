import type { ScheduledTaskDetailLink } from "./types/schedule";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseJsonString(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function parseScheduleDetailLink(value: unknown): ScheduledTaskDetailLink | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.type !== "zora-schedule-task") {
    return null;
  }

  if (
    typeof value.workspaceId !== "string" ||
    value.workspaceId.trim().length === 0 ||
    typeof value.taskId !== "string" ||
    value.taskId.trim().length === 0
  ) {
    return null;
  }

  return {
    type: "zora-schedule-task",
    workspaceId: value.workspaceId,
    taskId: value.taskId,
    label:
      typeof value.label === "string" && value.label.trim().length > 0
        ? value.label
        : "查看定时任务",
  };
}

export function extractScheduleDetailLinkFromToolResultValue(
  value: unknown
): ScheduledTaskDetailLink | null {
  const parsed = typeof value === "string" ? parseJsonString(value) : value;

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (!isRecord(item)) {
        continue;
      }

      const text =
        typeof item.text === "string"
          ? item.text
          : typeof item.content === "string"
            ? item.content
            : null;

      if (!text) {
        continue;
      }

      const link = extractScheduleDetailLinkFromToolResultValue(text);
      if (link) {
        return link;
      }
    }

    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  return parseScheduleDetailLink(parsed.detailLink);
}
