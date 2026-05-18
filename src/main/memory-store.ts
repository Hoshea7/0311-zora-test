import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { replaceFileAtomically, ZORA_DIR } from "./utils/fs";

const MEMORY_DIR_NAME = "memory";
const DAILY_DIR_NAME = "daily";
const MIGRATIONS_DIR_NAME = ".migrations";
const LEGACY_ZORAS_DIR_NAME = "zoras";
const LEGACY_DAILY_DIR_NAME = "memory";
const LEGACY_DEFAULT_ID = "default";
const LEGACY_MEMORY_MIGRATION_MARKER_FILE = "legacy-default-memory.json";
const SOUL_FILE_NAME = "SOUL.md";
const IDENTITY_FILE_NAME = "IDENTITY.md";
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_FILE_PATTERN = /^(\d{4}-\d{2}-\d{2})\.md$/;
const MIGRATABLE_LEGACY_ROOT_FILES = ["USER.md", "MEMORY.md"] as const;
const IGNORED_LEGACY_ROOT_FILES = [SOUL_FILE_NAME, IDENTITY_FILE_NAME] as const;

export interface LegacyMemoryMigrationResult {
  sourceDir: string;
  targetDir: string;
  markerPath: string | null;
  migrated: string[];
  skipped: string[];
  ignored: string[];
}

let defaultLegacyMemoryMigrationPromise: Promise<LegacyMemoryMigrationResult> | null = null;

function hasErrorCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function isEnoentError(error: unknown) {
  return hasErrorCode(error, "ENOENT");
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

function resolveLegacyZoraFilePath(fileName: string, legacyId = LEGACY_DEFAULT_ID) {
  assertSafeFileName(fileName);
  return path.join(getLegacyZoraDirPath(legacyId), fileName);
}

function resolveDailyLogPath(date: string) {
  assertIsoDate(date);
  return path.join(getZoraDailyDirPath(), `${date}.md`);
}

function resolveLegacyDailyLogPath(date: string, legacyId = LEGACY_DEFAULT_ID) {
  assertIsoDate(date);
  return path.join(getLegacyZoraMemoryDirPath(legacyId), `${date}.md`);
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

async function copyFileIfMissing(
  sourcePath: string,
  targetPath: string,
  label: string,
  result: LegacyMemoryMigrationResult
) {
  if (!(await pathExistsAsFile(sourcePath))) {
    return;
  }

  if (await pathExistsAsFile(targetPath)) {
    result.skipped.push(label);
    return;
  }

  const content = await readUtf8File(sourcePath);
  if (content === null) {
    return;
  }

  await mkdir(path.dirname(targetPath), { recursive: true });

  try {
    await writeFile(targetPath, content, { encoding: "utf8", flag: "wx" });
    result.migrated.push(label);
  } catch (error) {
    if (hasErrorCode(error, "EEXIST")) {
      result.skipped.push(label);
      return;
    }

    throw error;
  }
}

export function getZoraBaseDirPath() {
  return ZORA_DIR;
}

export function getZoraMemoryDirPath() {
  return path.join(getZoraBaseDirPath(), MEMORY_DIR_NAME);
}

export function getZoraDailyDirPath() {
  return path.join(getZoraMemoryDirPath(), DAILY_DIR_NAME);
}

export function getZoraMemoryMigrationsDirPath() {
  return path.join(getZoraMemoryDirPath(), MIGRATIONS_DIR_NAME);
}

export function getLegacyMemoryMigrationMarkerPath() {
  return path.join(getZoraMemoryMigrationsDirPath(), LEGACY_MEMORY_MIGRATION_MARKER_FILE);
}

export function getLegacyZoraDirPath(legacyId = LEGACY_DEFAULT_ID) {
  return path.join(getZoraBaseDirPath(), LEGACY_ZORAS_DIR_NAME, legacyId);
}

export function getLegacyZoraMemoryDirPath(legacyId = LEGACY_DEFAULT_ID) {
  return path.join(getLegacyZoraDirPath(legacyId), LEGACY_DAILY_DIR_NAME);
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

export async function ensureZoraDir() {
  await mkdir(getZoraMemoryDirPath(), { recursive: true });
  await mkdir(getZoraDailyDirPath(), { recursive: true });
}

async function performLegacyMemoryMigration() {
  await ensureZoraDir();

  const result: LegacyMemoryMigrationResult = {
    sourceDir: getLegacyZoraDirPath(),
    targetDir: getZoraMemoryDirPath(),
    markerPath: null,
    migrated: [],
    skipped: [],
    ignored: [],
  };

  for (const fileName of MIGRATABLE_LEGACY_ROOT_FILES) {
    await copyFileIfMissing(
      resolveLegacyZoraFilePath(fileName),
      resolveZoraFilePath(fileName),
      fileName,
      result
    );
  }

  for (const fileName of IGNORED_LEGACY_ROOT_FILES) {
    if (await pathExistsAsFile(resolveLegacyZoraFilePath(fileName))) {
      result.ignored.push(fileName);
    }
  }

  try {
    const entries = await readdir(getLegacyZoraMemoryDirPath(), { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const match = entry.name.match(ISO_DATE_FILE_PATTERN);
      if (!match) {
        continue;
      }

      const date = match[1];
      await copyFileIfMissing(
        path.join(getLegacyZoraMemoryDirPath(), entry.name),
        resolveDailyLogPath(date),
        `${DAILY_DIR_NAME}/${entry.name}`,
        result
      );
    }
  } catch (error) {
    if (!isEnoentError(error)) {
      throw error;
    }
  }

  if (result.migrated.length > 0 || result.skipped.length > 0 || result.ignored.length > 0) {
    result.markerPath = getLegacyMemoryMigrationMarkerPath();
    await mkdir(getZoraMemoryMigrationsDirPath(), { recursive: true });
    await replaceFileAtomically(
      result.markerPath,
      `${JSON.stringify(
        {
          version: 1,
          migratedAt: new Date().toISOString(),
          sourceDir: result.sourceDir,
          targetDir: result.targetDir,
          migrated: result.migrated,
          skipped: result.skipped,
          ignored: result.ignored,
        },
        null,
        2
      )}\n`
    );
  }

  return result;
}

export async function migrateLegacyMemoryIfNeeded() {
  if (!defaultLegacyMemoryMigrationPromise) {
    defaultLegacyMemoryMigrationPromise = performLegacyMemoryMigration().catch((error) => {
      defaultLegacyMemoryMigrationPromise = null;
      throw error;
    });
  }

  return defaultLegacyMemoryMigrationPromise;
}

export async function loadFile(fileName: string) {
  const currentPath = isLegacyOnlyFile(fileName)
    ? null
    : resolveZoraFilePath(fileName);
  const currentContent = currentPath ? await readUtf8File(currentPath) : null;

  if (currentContent !== null) {
    return currentContent;
  }

  return readUtf8File(resolveLegacyZoraFilePath(fileName));
}

export async function saveFile(fileName: string, content: string) {
  if (isLegacyOnlyFile(fileName)) {
    throw new Error(`${fileName} is not part of the Zora memory structure.`);
  }

  await ensureZoraDir();
  await replaceFileAtomically(resolveZoraFilePath(fileName), content);
}

export async function hasFile(fileName: string) {
  if (!isLegacyOnlyFile(fileName) && (await pathExistsAsFile(resolveZoraFilePath(fileName)))) {
    return true;
  }

  return pathExistsAsFile(resolveLegacyZoraFilePath(fileName));
}

export async function listFiles() {
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

export async function appendDailyLog(text: string) {
  const now = new Date();
  const today = getIsoDate(now);
  const entry = `### ${getTimeLabel(now)}\n${text}\n\n`;

  await ensureZoraDir();
  await appendFile(resolveDailyLogPath(today), entry, "utf8");
}

export async function loadDailyLog(date: string) {
  const currentContent = await readUtf8File(resolveDailyLogPath(date));
  if (currentContent !== null) {
    return currentContent;
  }

  return readUtf8File(resolveLegacyDailyLogPath(date));
}

export async function loadRecentLogs(days: number) {
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
      content: await loadDailyLog(date),
    }))
  );
  const sections = logs
    .filter((log): log is { date: string; content: string } => log.content !== null)
    .map((log) => `## ${log.date}\n${log.content.trimEnd()}`);

  return sections.length > 0 ? sections.join("\n\n") : null;
}

export const memoryStore = {
  getZoraBaseDirPath,
  getZoraMemoryDirPath,
  getZoraDailyDirPath,
  getZoraMemoryMigrationsDirPath,
  getLegacyMemoryMigrationMarkerPath,
  getLegacyZoraDirPath,
  getLegacyZoraMemoryDirPath,
  estimateTokens,
  ensureZoraDir,
  migrateLegacyMemoryIfNeeded,
  loadFile,
  saveFile,
  hasFile,
  listFiles,
  appendDailyLog,
  loadDailyLog,
  loadRecentLogs,
};
