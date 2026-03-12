import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const DEFAULT_ZORA_ID = "default";

const ZORA_DIR_NAME = ".zora";
const ZORAS_DIR_NAME = "zoras";
const MEMORY_DIR_NAME = "memory";
const BOOTSTRAP_FILE_NAME = "SOUL.md";
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function hasErrorCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function isEnoentError(error: unknown) {
  return hasErrorCode(error, "ENOENT");
}

function isRenameReplaceError(error: unknown) {
  return (
    hasErrorCode(error, "EEXIST") ||
    hasErrorCode(error, "EPERM") ||
    hasErrorCode(error, "ENOTEMPTY")
  );
}

function assertSafeFileName(fileName: string) {
  if (fileName.trim().length === 0 || path.basename(fileName) !== fileName) {
    throw new Error(`Invalid zora file name: ${fileName}`);
  }
}

function assertIsoDate(date: string) {
  if (!ISO_DATE_PATTERN.test(date)) {
    throw new Error(`Invalid ISO date: ${date}`);
  }
}

function getIsoDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getTimeLabel(date = new Date()) {
  return date.toTimeString().slice(0, 5);
}

function getDateWithOffset(daysOffset: number, now = new Date()) {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() + daysOffset);
  return getIsoDate(date);
}

function resolveZoraFilePath(fileName: string, zoraId = DEFAULT_ZORA_ID) {
  assertSafeFileName(fileName);
  return path.join(getZoraDirPath(zoraId), fileName);
}

function resolveDailyLogPath(date: string, zoraId = DEFAULT_ZORA_ID) {
  assertIsoDate(date);
  return path.join(getZoraMemoryDirPath(zoraId), `${date}.md`);
}

async function readUtf8File(filePath: string) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isEnoentError(error)) {
      return null;
    }

    throw error;
  }
}

async function pathExistsAsFile(filePath: string) {
  try {
    const fileStats = await stat(filePath);
    return fileStats.isFile();
  } catch (error) {
    if (isEnoentError(error)) {
      return false;
    }

    throw error;
  }
}

async function replaceFileAtomically(filePath: string, content: string) {
  const tempPath = `${filePath}.tmp`;

  await writeFile(tempPath, content, "utf8");

  try {
    await rename(tempPath, filePath);
  } catch (error) {
    if (isRenameReplaceError(error)) {
      try {
        await unlink(filePath);
      } catch (unlinkError) {
        if (!isEnoentError(unlinkError)) {
          throw unlinkError;
        }
      }

      await rename(tempPath, filePath);
      return;
    }

    try {
      await unlink(tempPath);
    } catch (cleanupError) {
      if (!isEnoentError(cleanupError)) {
        throw cleanupError;
      }
    }

    throw error;
  }
}

export function getZoraDirPath(zoraId = DEFAULT_ZORA_ID) {
  return path.join(homedir(), ZORA_DIR_NAME, ZORAS_DIR_NAME, zoraId);
}

export function getZoraMemoryDirPath(zoraId = DEFAULT_ZORA_ID) {
  return path.join(getZoraDirPath(zoraId), MEMORY_DIR_NAME);
}

export async function ensureZoraDir(zoraId = DEFAULT_ZORA_ID) {
  const zoraDirPath = getZoraDirPath(zoraId);
  const memoryDirPath = getZoraMemoryDirPath(zoraId);

  await mkdir(zoraDirPath, { recursive: true });
  await mkdir(memoryDirPath, { recursive: true });
}

export async function loadFile(fileName: string, zoraId = DEFAULT_ZORA_ID) {
  return readUtf8File(resolveZoraFilePath(fileName, zoraId));
}

export async function saveFile(
  fileName: string,
  content: string,
  zoraId = DEFAULT_ZORA_ID
) {
  await ensureZoraDir(zoraId);
  await replaceFileAtomically(resolveZoraFilePath(fileName, zoraId), content);
}

export async function hasFile(fileName: string, zoraId = DEFAULT_ZORA_ID) {
  return pathExistsAsFile(resolveZoraFilePath(fileName, zoraId));
}

export async function isBootstrapped(zoraId = DEFAULT_ZORA_ID) {
  return hasFile(BOOTSTRAP_FILE_NAME, zoraId);
}

export async function listFiles(zoraId = DEFAULT_ZORA_ID) {
  try {
    const entries = await readdir(getZoraDirPath(zoraId), { withFileTypes: true });

    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (isEnoentError(error)) {
      return [];
    }

    throw error;
  }
}

export async function appendDailyLog(text: string, zoraId = DEFAULT_ZORA_ID) {
  const now = new Date();
  const today = getIsoDate(now);
  const entry = `### ${getTimeLabel(now)}\n${text}\n\n`;

  await ensureZoraDir(zoraId);
  await appendFile(resolveDailyLogPath(today, zoraId), entry, "utf8");
}

export async function loadDailyLog(date: string, zoraId = DEFAULT_ZORA_ID) {
  return readUtf8File(resolveDailyLogPath(date, zoraId));
}

export async function loadRecentLogs(days: number, zoraId = DEFAULT_ZORA_ID) {
  const totalDays = Math.max(0, Math.floor(days));

  if (totalDays === 0) {
    return null;
  }

  const dates = Array.from({ length: totalDays }, (_, index) =>
    getDateWithOffset(index - totalDays + 1)
  );
  const logs = await Promise.all(
    dates.map(async (date) => ({
      date,
      content: await loadDailyLog(date, zoraId)
    }))
  );
  const sections = logs
    .filter((log): log is { date: string; content: string } => log.content !== null)
    .map((log) => `## ${log.date}\n${log.content.trimEnd()}`);

  return sections.length > 0 ? sections.join("\n\n") : null;
}

export const memoryStore = {
  DEFAULT_ZORA_ID,
  getZoraDirPath,
  getZoraMemoryDirPath,
  ensureZoraDir,
  loadFile,
  saveFile,
  hasFile,
  isBootstrapped,
  listFiles,
  appendDailyLog,
  loadDailyLog,
  loadRecentLogs
};
