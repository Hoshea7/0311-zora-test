import { randomUUID } from "node:crypto";
import {
  mkdir,
  rename as fsRename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

function expandHomeDir(input: string): string {
  if (input === "~") {
    return homedir();
  }

  if (input.startsWith("~/")) {
    return path.join(homedir(), input.slice(2));
  }

  return input;
}

function resolveZoraDir(): string {
  const configuredHome = process.env.ZORA_HOME?.trim();
  if (!configuredHome) {
    return path.join(homedir(), ".zora");
  }

  return path.resolve(expandHomeDir(configuredHome));
}

export const ZORA_DIR = resolveZoraDir();
const fileWriteQueues = new Map<string, Promise<unknown>>();

export function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === code
  );
}

export function isEnoentError(error: unknown): boolean {
  return hasErrorCode(error, "ENOENT");
}

function isRenameReplaceError(error: unknown): boolean {
  return (
    hasErrorCode(error, "EEXIST") ||
    hasErrorCode(error, "EPERM") ||
    hasErrorCode(error, "ENOTEMPTY")
  );
}

async function runQueuedFileWrite<T>(
  filePath: string,
  task: () => Promise<T>
): Promise<T> {
  const queueKey = path.resolve(filePath);
  const previous = fileWriteQueues.get(queueKey) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);

  fileWriteQueues.set(queueKey, next);

  try {
    return await next;
  } finally {
    if (fileWriteQueues.get(queueKey) === next) {
      fileWriteQueues.delete(queueKey);
    }
  }
}

async function writeFileAtomicallyNow(
  filePath: string,
  content: string
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });

  const tmpPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`
  );
  await writeFile(tmpPath, content, "utf8");

  let replaced = false;
  try {
    await fsRename(tmpPath, filePath);
    replaced = true;
  } catch (error: unknown) {
    if (isRenameReplaceError(error)) {
      try {
        await unlink(filePath);
      } catch (unlinkError) {
        if (!isEnoentError(unlinkError)) {
          throw unlinkError;
        }
      }

      await fsRename(tmpPath, filePath);
      replaced = true;
      return;
    }

    throw error;
  } finally {
    if (!replaced) {
      try {
        await unlink(tmpPath);
      } catch (cleanupError) {
        if (!isEnoentError(cleanupError)) {
          throw cleanupError;
        }
      }
    }
  }
}

export async function replaceFileAtomically(filePath: string, content: string): Promise<void> {
  await runQueuedFileWrite(filePath, () => writeFileAtomicallyNow(filePath, content));
}

export async function ensureZoraDir(): Promise<void> {
  await mkdir(ZORA_DIR, { recursive: true });
}
