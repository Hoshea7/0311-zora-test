import type { ArchivedSessionEntry } from "../../../../shared/zora";

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatArchivedDate(value?: string): string {
  if (!value) {
    return "未知时间";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "未知时间";
  }

  return dateFormatter.format(date);
}

export function getArchivedSessionKey(entry: ArchivedSessionEntry): string {
  return `${entry.workspaceId}:${entry.session.id}`;
}

export function removeEntriesByKey(
  entries: ArchivedSessionEntry[],
  keys: ReadonlySet<string>
): ArchivedSessionEntry[] {
  return entries.filter((entry) => !keys.has(getArchivedSessionKey(entry)));
}

export function removeSelectedKeys(
  selectedKeys: ReadonlySet<string>,
  keysToRemove: ReadonlySet<string>
): Set<string> {
  return new Set([...selectedKeys].filter((key) => !keysToRemove.has(key)));
}

export function formatBatchActionError(
  actionLabel: string,
  failedCount: number,
  reason: string
): string {
  return `${failedCount} 条会话${actionLabel}失败：${reason}`;
}

export async function collectArchivedEntryResults(
  entries: ArchivedSessionEntry[],
  run: (entry: ArchivedSessionEntry) => Promise<void>
): Promise<{
  successfulKeys: Set<string>;
  failures: PromiseRejectedResult[];
}> {
  const successfulKeys = new Set<string>();
  const failures: PromiseRejectedResult[] = [];

  for (const entry of entries) {
    try {
      await run(entry);
      successfulKeys.add(getArchivedSessionKey(entry));
    } catch (reason) {
      failures.push({ status: "rejected", reason });
    }
  }

  return { successfulKeys, failures };
}
