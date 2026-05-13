import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const DEFAULT_ZORA_ID = "default";

const ZORA_DIR_NAME = ".zora";
const MEMORY_DIR_NAME = "memory";
const DAILY_DIR_NAME = "daily";
const LEGACY_ZORAS_DIR_NAME = "zoras";
const LEGACY_DAILY_DIR_NAME = "memory";
const SOUL_FILE_NAME = "SOUL.md";
const IDENTITY_FILE_NAME = "IDENTITY.md";
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

function padNumber(value: number) {
  return value.toString().padStart(2, "0");
}

function getIsoDate(date = new Date()) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function getTimeLabel(date = new Date()) {
  return `${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`;
}

function getDateWithOffset(daysOffset: number, now = new Date()) {
  const date = new Date(now);
  date.setDate(date.getDate() + daysOffset);
  return getIsoDate(date);
}

function isLegacyOnlyFile(fileName: string) {
  return fileName === SOUL_FILE_NAME || fileName === IDENTITY_FILE_NAME;
}

function resolveZoraFilePath(fileName: string) {
  assertSafeFileName(fileName);
  return path.join(getZoraMemoryDirPath(), fileName);
}

function resolveLegacyZoraFilePath(fileName: string, zoraId = DEFAULT_ZORA_ID) {
  assertSafeFileName(fileName);
  return path.join(getLegacyZoraDirPath(zoraId), fileName);
}

function resolveDailyLogPath(date: string) {
  assertIsoDate(date);
  return path.join(getZoraDailyDirPath(), `${date}.md`);
}

function resolveLegacyDailyLogPath(date: string, zoraId = DEFAULT_ZORA_ID) {
  assertIsoDate(date);
  return path.join(getLegacyZoraMemoryDirPath(zoraId), `${date}.md`);
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

export function getZoraBaseDirPath() {
  return path.join(homedir(), ZORA_DIR_NAME);
}

export function getZoraMemoryDirPath(_zoraId = DEFAULT_ZORA_ID) {
  return path.join(getZoraBaseDirPath(), MEMORY_DIR_NAME);
}

export function getZoraDailyDirPath(_zoraId = DEFAULT_ZORA_ID) {
  return path.join(getZoraMemoryDirPath(), DAILY_DIR_NAME);
}

export function getZoraDirPath(zoraId = DEFAULT_ZORA_ID) {
  return getZoraMemoryDirPath(zoraId);
}

export function getLegacyZoraDirPath(zoraId = DEFAULT_ZORA_ID) {
  return path.join(getZoraBaseDirPath(), LEGACY_ZORAS_DIR_NAME, zoraId);
}

export function getLegacyZoraMemoryDirPath(zoraId = DEFAULT_ZORA_ID) {
  return path.join(getLegacyZoraDirPath(zoraId), LEGACY_DAILY_DIR_NAME);
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

export async function ensureZoraDir(_zoraId = DEFAULT_ZORA_ID) {
  await mkdir(getZoraMemoryDirPath(), { recursive: true });
  await mkdir(getZoraDailyDirPath(), { recursive: true });
}

export async function loadFile(fileName: string, zoraId = DEFAULT_ZORA_ID) {
  const currentPath = isLegacyOnlyFile(fileName)
    ? null
    : resolveZoraFilePath(fileName);
  const currentContent = currentPath ? await readUtf8File(currentPath) : null;

  if (currentContent !== null) {
    return currentContent;
  }

  return readUtf8File(resolveLegacyZoraFilePath(fileName, zoraId));
}

export async function saveFile(
  fileName: string,
  content: string,
  _zoraId = DEFAULT_ZORA_ID
) {
  if (isLegacyOnlyFile(fileName)) {
    throw new Error(`${fileName} is not part of the Zora memory structure.`);
  }

  await ensureZoraDir();
  await replaceFileAtomically(resolveZoraFilePath(fileName), content);
}

export async function hasFile(fileName: string, zoraId = DEFAULT_ZORA_ID) {
  if (!isLegacyOnlyFile(fileName) && (await pathExistsAsFile(resolveZoraFilePath(fileName)))) {
    return true;
  }

  return pathExistsAsFile(resolveLegacyZoraFilePath(fileName, zoraId));
}

export async function listFiles(_zoraId = DEFAULT_ZORA_ID) {
  try {
    const entries = await readdir(getZoraMemoryDirPath(), { withFileTypes: true });

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

export async function appendDailyLog(text: string, _zoraId = DEFAULT_ZORA_ID) {
  const now = new Date();
  const today = getIsoDate(now);
  const entry = `### ${getTimeLabel(now)}\n${text}\n\n`;

  await ensureZoraDir();
  await appendFile(resolveDailyLogPath(today), entry, "utf8");
}

export async function loadDailyLog(date: string, zoraId = DEFAULT_ZORA_ID) {
  const currentContent = await readUtf8File(resolveDailyLogPath(date));
  if (currentContent !== null) {
    return currentContent;
  }

  return readUtf8File(resolveLegacyDailyLogPath(date, zoraId));
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
      content: await loadDailyLog(date, zoraId),
    }))
  );
  const sections = logs
    .filter((log): log is { date: string; content: string } => log.content !== null)
    .map((log) => `## ${log.date}\n${log.content.trimEnd()}`);

  return sections.length > 0 ? sections.join("\n\n") : null;
}

export const memoryStore = {
  DEFAULT_ZORA_ID,
  getZoraBaseDirPath,
  getZoraDirPath,
  getZoraMemoryDirPath,
  getZoraDailyDirPath,
  getLegacyZoraDirPath,
  getLegacyZoraMemoryDirPath,
  estimateTokens,
  ensureZoraDir,
  loadFile,
  saveFile,
  hasFile,
  listFiles,
  appendDailyLog,
  loadDailyLog,
  loadRecentLogs,
};
