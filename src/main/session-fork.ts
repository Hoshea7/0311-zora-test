import { randomUUID } from "node:crypto";
import { access, copyFile, mkdir, readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type {
  ConversationMessage,
  SessionForkRequest,
  SessionForkResult,
} from "../shared/zora";
import { normalizeOptionalString } from "./utils/validate";
import {
  copySessionWorkingDirectory,
  createForkedSession,
  createSessionWorkingDirectory,
  deleteManagedSessionWorkingDirectory,
  flushSessionWrites,
  getSessionMeta,
  getSessionWorkingDirectory,
  loadMessages,
} from "./session-store";

export interface ForkSessionFromSourceInput extends SessionForkRequest {
  workspaceId: string;
}

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

async function getClaudeProjectDirForPath(projectPath: string): Promise<string> {
  const normalizedPath = await normalizeProjectPath(projectPath);
  const projectsDir = getClaudeProjectsDir();
  const encodedName = encodeClaudeProjectDirName(normalizedPath);
  const exactProjectDir = path.join(projectsDir, encodedName);

  try {
    await access(exactProjectDir);
    return exactProjectDir;
  } catch {
    if (encodedName.length <= 200) {
      return exactProjectDir;
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
}

async function copyForkedSdkTranscriptToTargetProject(input: {
  sdkSessionId: string;
  sourceWorkingDirectory: string;
  targetWorkingDirectory: string;
}): Promise<void> {
  const sourceProjectDir = await getClaudeProjectDirForPath(
    input.sourceWorkingDirectory
  );
  const targetProjectDir = await getClaudeProjectDirForPath(
    input.targetWorkingDirectory
  );

  if (sourceProjectDir === targetProjectDir) {
    return;
  }

  await mkdir(targetProjectDir, { recursive: true });
  await copyFile(
    path.join(sourceProjectDir, `${input.sdkSessionId}.jsonl`),
    path.join(targetProjectDir, `${input.sdkSessionId}.jsonl`)
  );
}

export async function forkSessionFromSource(
  input: ForkSessionFromSourceInput
): Promise<SessionForkResult> {
  const source = await getSessionMeta(input.sourceSessionId, input.workspaceId);

  if (!source) {
    throw new Error(`Session ${input.sourceSessionId} not found.`);
  }

  if (!source.sdkSessionId) {
    throw new Error(
      "当前会话还没有可分叉的 Claude SDK 上下文。请先在该会话里发送一条消息后再试。"
    );
  }

  const targetSessionId = randomUUID();
  const targetWorkingDirectory = await createSessionWorkingDirectory(
    targetSessionId,
    input.workspaceId
  );
  const sourceWorkingDirectory = await getSessionWorkingDirectory(
    source.id,
    input.workspaceId
  );
  const title = normalizeOptionalString(input.title) ?? source.title;
  const upToMessageId = normalizeOptionalString(input.upToMessageId) ?? undefined;
  const { forkSession: forkSdkSession } = await import(
    "@anthropic-ai/claude-agent-sdk"
  );
  let forkedSdkSessionId = "";

  try {
    await flushSessionWrites(source.id, input.workspaceId);
    await copySessionWorkingDirectory(
      source.id,
      targetSessionId,
      input.workspaceId,
      sourceWorkingDirectory
    );
    const sdkFork = await forkSdkSession(source.sdkSessionId, {
      dir: sourceWorkingDirectory,
      title,
      upToMessageId,
    });

    if (!sdkFork.sessionId) {
      throw new Error("Claude Agent SDK did not return a forked session id.");
    }

    forkedSdkSessionId = sdkFork.sessionId;
    await copyForkedSdkTranscriptToTargetProject({
      sdkSessionId: forkedSdkSessionId,
      sourceWorkingDirectory,
      targetWorkingDirectory,
    });
  } catch (error) {
    await deleteManagedSessionWorkingDirectory(
      targetSessionId,
      input.workspaceId,
      targetWorkingDirectory
    );
    throw error;
  }

  const session = await createForkedSession(
    {
      id: targetSessionId,
      sourceSessionId: source.id,
      sourceSdkSessionId: source.sdkSessionId,
      sdkSessionId: forkedSdkSessionId,
      title,
      workingDirectory: targetWorkingDirectory,
      upToMessageId,
    },
    input.workspaceId
  );
  const messages: ConversationMessage[] = await loadMessages(
    session.id,
    input.workspaceId
  );

  return {
    session,
    messages,
  };
}
