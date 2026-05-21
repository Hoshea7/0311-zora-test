import { createReadStream } from "node:fs";
import { access, copyFile, mkdir, readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { isRecord } from "./utils/guards";
import { isEnoentError } from "./utils/fs";
import { getErrorMessage, logSystemEvent } from "./system-log";

const ASSISTANT_RECORD_TYPE = "assistant";

type AssistantForkMapping = {
  sourceMessageUuid: string;
  forkedMessageUuid: string;
};

function hashProjectPath(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
}

function encodeClaudeProjectDirName(projectPath: string): string {
  const sanitized = projectPath.replace(/[^a-zA-Z0-9]/g, "-");

  if (sanitized.length <= 200) {
    return sanitized;
  }

  return `${sanitized.slice(0, 200)}-${hashProjectPath(projectPath)}`;
}

function getClaudeProjectsDir(): string {
  return path.join(
    (process.env.CLAUDE_CONFIG_DIR ?? path.join(homedir(), ".claude")).normalize(
      "NFC"
    ),
    "projects"
  );
}

async function normalizeProjectPath(projectPath: string): Promise<string> {
  try {
    return (await realpath(projectPath)).normalize("NFC");
  } catch {
    return projectPath.normalize("NFC");
  }
}

export async function getClaudeProjectDirForPath(
  projectPath: string
): Promise<string> {
  const normalizedPath = await normalizeProjectPath(projectPath);
  const projectsDir = getClaudeProjectsDir();
  const encodedName = encodeClaudeProjectDirName(normalizedPath);
  const exactProjectDir = path.join(projectsDir, encodedName);

  if (encodedName.length <= 200) {
    return exactProjectDir;
  }

  try {
    await access(exactProjectDir);
    return exactProjectDir;
  } catch {
    // Fall through to the prefix lookup used by older Claude project paths.
  }

  try {
    const prefix = encodedName.slice(0, 200);
    const entries = await readdir(projectsDir, { withFileTypes: true });
    const matched = entries.find(
      (entry) => entry.isDirectory() && entry.name.startsWith(`${prefix}-`)
    );

    if (matched) {
      return path.join(projectsDir, matched.name);
    }
  } catch {
    // Fall through to the exact path for new project directories.
  }

  return exactProjectDir;
}

export async function getClaudeTranscriptPath(input: {
  sdkSessionId: string;
  workingDirectory: string;
}): Promise<string> {
  return path.join(
    await getClaudeProjectDirForPath(input.workingDirectory),
    `${input.sdkSessionId}.jsonl`
  );
}

export async function copyClaudeSdkTranscriptToProject(input: {
  sdkSessionId: string;
  sourceWorkingDirectory: string;
  targetWorkingDirectory: string;
}): Promise<void> {
  const sourcePath = await getClaudeTranscriptPath({
    sdkSessionId: input.sdkSessionId,
    workingDirectory: input.sourceWorkingDirectory,
  });
  const targetPath = await getClaudeTranscriptPath({
    sdkSessionId: input.sdkSessionId,
    workingDirectory: input.targetWorkingDirectory,
  });

  if (sourcePath === targetPath) {
    return;
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
}

function parseAssistantForkMapping(
  line: string,
  transcriptPath: string
): AssistantForkMapping | null {
  try {
    const record = JSON.parse(line) as unknown;
    if (!isRecord(record) || record.type !== ASSISTANT_RECORD_TYPE) {
      return null;
    }

    const forkedFrom = isRecord(record.forkedFrom)
      ? record.forkedFrom
      : undefined;

    if (!forkedFrom) {
      return null;
    }

    const forkedMessageUuid =
      typeof record.uuid === "string" ? record.uuid : undefined;
    const sourceMessageUuid =
      typeof forkedFrom.messageUuid === "string"
        ? forkedFrom.messageUuid
        : undefined;

    if (!forkedMessageUuid || !sourceMessageUuid) {
      logSystemEvent(
        "agent",
        "claude-transcript",
        "assistant-map:skip",
        "SDK transcript assistant record missing fork mapping fields",
        { transcriptPath },
        { verbose: true, level: "warn" }
      );
      return null;
    }

    return { sourceMessageUuid, forkedMessageUuid };
  } catch (error) {
    logSystemEvent(
      "agent",
      "claude-transcript",
      "parse:error",
      "SDK transcript line parse failed",
      { transcriptPath, error: getErrorMessage(error) },
      { verbose: true, level: "warn" }
    );
    return null;
  }
}

export async function readAssistantForkIdMap(input: {
  sdkSessionId: string;
  workingDirectory: string;
}): Promise<Map<string, string>> {
  const transcriptPath = await getClaudeTranscriptPath(input);
  const idMap = new Map<string, string>();

  try {
    const lines = createInterface({
      input: createReadStream(transcriptPath, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });

    for await (const line of lines) {
      if (line.trim().length === 0) {
        continue;
      }

      const mapping = parseAssistantForkMapping(line, transcriptPath);
      if (mapping) {
        idMap.set(mapping.sourceMessageUuid, mapping.forkedMessageUuid);
      }
    }
  } catch (error) {
    if (isEnoentError(error)) {
      return new Map();
    }

    throw error;
  }

  return idMap;
}
