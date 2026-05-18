import { randomUUID } from "node:crypto";
import {
  access,
  appendFile,
  cp,
  copyFile,
  mkdir,
  readFile,
  rename as fsRename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type {
  AssistantAction,
  AssistantTurn,
  ConversationMessage,
  FileAttachment,
  ProcessStep,
  SessionBranchMeta,
} from "../shared/zora";
import { extractScheduleDetailLinkFromToolResultValue } from "../shared/schedule-link";
import {
  DEFAULT_WORKSPACE_ID,
  getWorkspaceSessionFilesDir,
  listWorkspaces,
} from "./workspace-store";
import { getErrorMessage, logSystemEvent } from "./system-log";
import { replaceFileAtomically, ZORA_DIR } from "./utils/fs";

export interface SessionMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  sdkSessionId?: string;
  providerId?: string;
  providerLocked?: boolean;
  selectedModelId?: string;
  workingDirectory?: string;
  branch?: SessionBranchMeta;
}

export interface SavedAttachmentMeta {
  id: string;
  name: string;
  category: "image" | "document" | "text";
  mimeType: string;
  size: number;
  savedFileName: string;
}

export interface CreateForkedSessionInput {
  id?: string;
  sourceSessionId: string;
  sourceSdkSessionId: string;
  sdkSessionId: string;
  title?: string;
  workingDirectory?: string;
}

const OLD_SESSIONS_DIR = path.join(ZORA_DIR, "sessions");
const HISTORY_IMAGE_BASE64_LIMIT = 20;
const HISTORY_IMAGE_MAX_INLINE_BYTES = 5 * 1024 * 1024;

function getSessionsDir(workspaceId = "default"): string {
  return path.join(ZORA_DIR, "workspaces", workspaceId, "sessions");
}

function getIndexFile(workspaceId = "default"): string {
  return path.join(getSessionsDir(workspaceId), "index.json");
}

let migrationDone = false;

export async function migrateSessionsIfNeeded(): Promise<void> {
  if (migrationDone) {
    return;
  }

  migrationDone = true;

  const newDir = getSessionsDir("default");

  try {
    await access(OLD_SESSIONS_DIR);
  } catch {
    return;
  }

  try {
    await access(newDir);
    logSystemEvent(
      "store",
      "session",
      "migration:skip",
      "新版会话目录已存在，跳过旧目录迁移"
    );
    return;
  } catch {
    // The workspace-aware directory does not exist yet, continue migrating.
  }

  await mkdir(path.join(ZORA_DIR, "workspaces", "default"), { recursive: true });
  await fsRename(OLD_SESSIONS_DIR, newDir);
  logSystemEvent(
    "store",
    "session",
    "migration:done",
    "旧版会话目录已迁移到默认工作区"
  );
}

async function ensureSessionsDir(workspaceId = "default"): Promise<void> {
  await migrateSessionsIfNeeded();
  await mkdir(getSessionsDir(workspaceId), { recursive: true });
}

function isEnoentError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

async function readIndex(workspaceId = "default"): Promise<SessionMeta[]> {
  await migrateSessionsIfNeeded();

  try {
    const raw = await readFile(getIndexFile(workspaceId), "utf8");
    return JSON.parse(raw) as SessionMeta[];
  } catch {
    return [];
  }
}

async function writeIndex(
  sessions: SessionMeta[],
  workspaceId = "default"
): Promise<void> {
  await ensureSessionsDir(workspaceId);
  await replaceFileAtomically(
    getIndexFile(workspaceId),
    JSON.stringify(sessions, null, 2)
  );
}

function normalizePersistedPath(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

async function getWorkspaceForSession(workspaceId: string) {
  const workspaces = await listWorkspaces();
  const workspace = workspaces.find((item) => item.id === workspaceId);

  if (!workspace) {
    throw new Error(`Workspace ${workspaceId} does not exist.`);
  }

  return workspace;
}

async function resolveNewSessionWorkingDirectory(
  sessionId: string,
  workspaceId = DEFAULT_WORKSPACE_ID
): Promise<string> {
  const workspace = await getWorkspaceForSession(workspaceId);

  if (workspace.id === DEFAULT_WORKSPACE_ID) {
    return getWorkspaceSessionFilesDir(workspace.id, sessionId);
  }

  return workspace.path;
}

async function resolveLegacySessionWorkingDirectory(
  workspaceId = DEFAULT_WORKSPACE_ID
): Promise<string> {
  const workspace = await getWorkspaceForSession(workspaceId);

  if (workspace.id === DEFAULT_WORKSPACE_ID) {
    return homedir();
  }

  return workspace.path;
}

function isManagedSessionWorkingDirectory(
  sessionId: string,
  workspaceId: string,
  workingDirectory?: string
): boolean {
  const normalizedWorkingDirectory = normalizePersistedPath(workingDirectory);

  if (!normalizedWorkingDirectory) {
    return false;
  }

  return (
    path.resolve(normalizedWorkingDirectory) ===
    path.resolve(getWorkspaceSessionFilesDir(workspaceId, sessionId))
  );
}

async function removeManagedSessionWorkingDirectory(
  sessionId: string,
  workspaceId: string,
  workingDirectory?: string
): Promise<void> {
  const normalizedWorkingDirectory = normalizePersistedPath(workingDirectory);

  if (
    !normalizedWorkingDirectory ||
    !isManagedSessionWorkingDirectory(
      sessionId,
      workspaceId,
      normalizedWorkingDirectory
    )
  ) {
    return;
  }

  await rm(normalizedWorkingDirectory, {
    recursive: true,
    force: true,
  });
}

export async function deleteManagedSessionWorkingDirectory(
  sessionId: string,
  workspaceId: string,
  workingDirectory?: string
): Promise<void> {
  await removeManagedSessionWorkingDirectory(
    sessionId,
    workspaceId,
    workingDirectory
  );
}

async function hydrateSessionWorkingDirectories(
  sessions: SessionMeta[],
  workspaceId = DEFAULT_WORKSPACE_ID
): Promise<SessionMeta[]> {
  let didChange = false;
  const hydrated: SessionMeta[] = [];

  for (const session of sessions) {
    const workingDirectory = normalizePersistedPath(session.workingDirectory);

    if (workingDirectory) {
      hydrated.push(
        workingDirectory === session.workingDirectory
          ? session
          : { ...session, workingDirectory }
      );
      didChange = didChange || workingDirectory !== session.workingDirectory;
      continue;
    }

    const legacyWorkingDirectory = await resolveLegacySessionWorkingDirectory(
      workspaceId
    );
    hydrated.push({
      ...session,
      workingDirectory: legacyWorkingDirectory,
    });
    didChange = true;
  }

  if (didChange) {
    await writeIndex(hydrated, workspaceId);
  }

  return hydrated;
}

export async function createSessionWorkingDirectory(
  sessionId: string,
  workspaceId = DEFAULT_WORKSPACE_ID
): Promise<string> {
  const workingDirectory = await resolveNewSessionWorkingDirectory(
    sessionId,
    workspaceId
  );
  await mkdir(workingDirectory, { recursive: true });
  return workingDirectory;
}

export async function getSessionWorkingDirectory(
  sessionId: string,
  workspaceId = DEFAULT_WORKSPACE_ID
): Promise<string> {
  await ensureSessionsDir(workspaceId);

  const sessions = await readIndex(workspaceId);
  const index = sessions.findIndex((session) => session.id === sessionId);

  if (index === -1) {
    throw new Error(`Session ${sessionId} not found.`);
  }

  const existingWorkingDirectory = normalizePersistedPath(
    sessions[index].workingDirectory
  );

  if (existingWorkingDirectory) {
    await mkdir(existingWorkingDirectory, { recursive: true });
    return existingWorkingDirectory;
  }

  const workingDirectory = await resolveLegacySessionWorkingDirectory(
    workspaceId
  );
  sessions[index] = {
    ...sessions[index],
    workingDirectory,
  };
  await writeIndex(sessions, workspaceId);
  await mkdir(workingDirectory, { recursive: true });
  return workingDirectory;
}

export async function copySessionWorkingDirectory(
  sourceSessionId: string,
  targetSessionId: string,
  workspaceId = DEFAULT_WORKSPACE_ID
): Promise<void> {
  const sourceWorkingDirectory = await getSessionWorkingDirectory(
    sourceSessionId,
    workspaceId
  );
  const targetWorkingDirectory = getWorkspaceSessionFilesDir(
    workspaceId,
    targetSessionId
  );

  if (
    !isManagedSessionWorkingDirectory(
      sourceSessionId,
      workspaceId,
      sourceWorkingDirectory
    )
  ) {
    return;
  }

  try {
    await cp(sourceWorkingDirectory, targetWorkingDirectory, {
      recursive: true,
      force: true,
    });
  } catch (error) {
    if (isEnoentError(error)) {
      return;
    }

    throw error;
  }
}

export async function listSessions(workspaceId = "default"): Promise<SessionMeta[]> {
  await ensureSessionsDir(workspaceId);
  return hydrateSessionWorkingDirectories(await readIndex(workspaceId), workspaceId);
}

export async function createSession(
  title: string,
  workspaceId = "default"
): Promise<SessionMeta> {
  await ensureSessionsDir(workspaceId);

  const now = new Date().toISOString();
  const sessionId = randomUUID();
  const workingDirectory = await createSessionWorkingDirectory(
    sessionId,
    workspaceId
  );
  const meta: SessionMeta = {
    id: sessionId,
    title,
    createdAt: now,
    updatedAt: now,
    workingDirectory,
  };

  const sessions = await readIndex(workspaceId);
  sessions.unshift(meta);
  await writeIndex(sessions, workspaceId);
  return meta;
}

async function copySessionTranscript(
  sourceSessionId: string,
  targetSessionId: string,
  workspaceId = "default"
): Promise<void> {
  try {
    await copyFile(
      getJsonlPath(sourceSessionId, workspaceId),
      getJsonlPath(targetSessionId, workspaceId)
    );
  } catch (error) {
    if (isEnoentError(error)) {
      return;
    }

    throw error;
  }
}

async function copySessionAttachments(
  sourceSessionId: string,
  targetSessionId: string,
  workspaceId = "default"
): Promise<void> {
  try {
    await cp(
      getAttachmentsDir(sourceSessionId, workspaceId),
      getAttachmentsDir(targetSessionId, workspaceId),
      { recursive: true }
    );
  } catch (error) {
    if (isEnoentError(error)) {
      return;
    }

    throw error;
  }
}

async function removeSessionArtifacts(
  sessionId: string,
  workspaceId = "default",
  workingDirectory?: string
): Promise<void> {
  await Promise.allSettled([
    unlink(getJsonlPath(sessionId, workspaceId)),
    rm(getAttachmentsDir(sessionId, workspaceId), {
      recursive: true,
      force: true,
    }),
    removeManagedSessionWorkingDirectory(sessionId, workspaceId, workingDirectory),
  ]);
}

export async function createForkedSession(
  input: CreateForkedSessionInput,
  workspaceId = "default"
): Promise<SessionMeta> {
  await ensureSessionsDir(workspaceId);

  const sessions = await readIndex(workspaceId);
  const source = sessions.find((session) => session.id === input.sourceSessionId);

  if (!source) {
    throw new Error(`Source session ${input.sourceSessionId} not found.`);
  }

  const sourceMessages = await loadMessages(input.sourceSessionId, workspaceId);
  const now = new Date().toISOString();
  const title = input.title?.trim() || `${source.title} 的分支`;
  const sessionId = input.id ?? randomUUID();
  const workingDirectory =
    normalizePersistedPath(input.workingDirectory) ??
    (await createSessionWorkingDirectory(sessionId, workspaceId));
  await mkdir(workingDirectory, { recursive: true });
  const meta: SessionMeta = {
    id: sessionId,
    title,
    createdAt: now,
    updatedAt: now,
    sdkSessionId: input.sdkSessionId,
    providerLocked: false,
    workingDirectory,
    branch: {
      sourceSessionId: source.id,
      sourceSdkSessionId: input.sourceSdkSessionId,
      forkedAt: now,
      forkMode: "full",
      inheritedMessageCount: sourceMessages.length,
    },
  };

  try {
    await copySessionTranscript(source.id, meta.id, workspaceId);
    await copySessionAttachments(source.id, meta.id, workspaceId);
    await writeIndex([meta, ...sessions], workspaceId);
  } catch (error) {
    await removeSessionArtifacts(meta.id, workspaceId, meta.workingDirectory);
    throw error;
  }

  return meta;
}

export async function deleteSession(
  sessionId: string,
  workspaceId = "default"
): Promise<void> {
  await ensureSessionsDir(workspaceId);

  const sessions = await readIndex(workspaceId);
  const session = sessions.find((item) => item.id === sessionId);
  const filtered = sessions.filter((session) => session.id !== sessionId);
  await writeIndex(filtered, workspaceId);

  await removeSessionArtifacts(sessionId, workspaceId, session?.workingDirectory);
}

export async function updateSessionMeta(
  sessionId: string,
  updates: Partial<
    Pick<
      SessionMeta,
      | "title"
      | "sdkSessionId"
      | "providerId"
      | "providerLocked"
      | "selectedModelId"
      | "workingDirectory"
    >
  >,
  workspaceId = "default"
): Promise<void> {
  await ensureSessionsDir(workspaceId);

  const sessions = await readIndex(workspaceId);
  const index = sessions.findIndex((session) => session.id === sessionId);

  if (index === -1) {
    return;
  }

  sessions[index] = {
    ...sessions[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await writeIndex(sessions, workspaceId);
}

export async function getSessionMeta(
  sessionId: string,
  workspaceId = "default"
): Promise<SessionMeta | null> {
  await ensureSessionsDir(workspaceId);
  const sessions = await hydrateSessionWorkingDirectories(
    await readIndex(workspaceId),
    workspaceId
  );
  return sessions.find((session) => session.id === sessionId) ?? null;
}

export async function renameSession(
  sessionId: string,
  title: string,
  workspaceId = "default"
): Promise<void> {
  await updateSessionMeta(sessionId, { title }, workspaceId);
}

export async function setSdkSessionId(
  sessionId: string,
  sdkSessionId: string,
  workspaceId = "default"
): Promise<void> {
  await updateSessionMeta(sessionId, { sdkSessionId }, workspaceId);
}

export async function clearSdkSessionId(
  sessionId: string,
  workspaceId = "default"
): Promise<void> {
  await updateSessionMeta(sessionId, { sdkSessionId: undefined }, workspaceId);
}

export async function getSdkSessionId(
  sessionId: string,
  workspaceId = "default"
): Promise<string | undefined> {
  await ensureSessionsDir(workspaceId);
  const sessions = await readIndex(workspaceId);
  return sessions.find((session) => session.id === sessionId)?.sdkSessionId;
}

type PersistedUserMessage = Omit<ConversationMessage, "attachments" | "turn"> & {
  role: "user";
  attachments?: SavedAttachmentMeta[];
};

type MessageRecord =
  | {
      kind: "user";
      message: PersistedUserMessage;
    }
  | { kind: "assistant_turn"; turn: AssistantTurn }
  | {
      kind: "tool_result";
      toolUseId: string;
      result: string;
      isError: boolean;
      completedAt?: number;
      assistantActions?: AssistantAction[];
    };

function getJsonlPath(sessionId: string, workspaceId = "default"): string {
  return path.join(getSessionsDir(workspaceId), `${sessionId}.jsonl`);
}

function getAttachmentsDir(sessionId: string, workspaceId = "default"): string {
  return path.join(getSessionsDir(workspaceId), "attachments", sessionId);
}

function getAttachmentPath(
  sessionId: string,
  savedFileName: string,
  workspaceId = "default"
): string {
  return path.join(getAttachmentsDir(sessionId, workspaceId), savedFileName);
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringifyPersistedValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value === undefined || value === null) {
    return "";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function createAssistantMessageFromTurn(turn: AssistantTurn): ConversationMessage {
  return {
    id: turn.id,
    role: "assistant",
    turn,
    timestamp: turn.startedAt,
  };
}

function getAssistantActionKey(action: AssistantAction): string {
  if (action.type === "schedule-task-link") {
    return `${action.type}:${action.link.workspaceId}:${action.link.taskId}`;
  }

  return action.type;
}

function normalizeAssistantActions(value: unknown): AssistantAction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const actions: AssistantAction[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!isRecord(item) || item.type !== "schedule-task-link") {
      continue;
    }

    const link = extractScheduleDetailLinkFromToolResultValue({
      detailLink: item.link,
    });

    if (!link) {
      continue;
    }

    const action: AssistantAction = {
      type: "schedule-task-link",
      link,
    };
    const key = getAssistantActionKey(action);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    actions.push(action);
  }

  return actions;
}

function toAssistantActions(value: unknown): AssistantAction[] | undefined {
  const actions = normalizeAssistantActions(value);

  return actions.length > 0 ? actions : undefined;
}

function mergeAssistantActions(
  existingActions: AssistantAction[] | undefined,
  nextActions: AssistantAction[] | undefined
): AssistantAction[] | undefined {
  if (!nextActions || nextActions.length === 0) {
    return existingActions;
  }

  const merged = existingActions ? [...existingActions] : [];
  const seen = new Set(merged.map(getAssistantActionKey));

  for (const action of nextActions) {
    const key = getAssistantActionKey(action);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(action);
  }

  return merged;
}

function extractAssistantActionsFromToolResult(content: unknown): AssistantAction[] {
  const link = extractScheduleDetailLinkFromToolResultValue(content);

  return link
    ? [
        {
          type: "schedule-task-link",
          link,
        },
      ]
    : [];
}

function mergeAssistantTurns(
  existingTurn: AssistantTurn,
  nextTurn: AssistantTurn
): AssistantTurn {
  return {
    ...existingTurn,
    processSteps: [...existingTurn.processSteps, ...nextTurn.processSteps],
    bodySegments: [...existingTurn.bodySegments, ...nextTurn.bodySegments],
    actions: mergeAssistantActions(existingTurn.actions, nextTurn.actions),
    status: "done",
    error: nextTurn.error ?? existingTurn.error,
    completedAt: nextTurn.completedAt ?? existingTurn.completedAt,
  };
}

function normalizeTurn(rawTurn: unknown): AssistantTurn | null {
  if (!isRecord(rawTurn)) {
    return null;
  }

  const startedAt =
    typeof rawTurn.startedAt === "number" ? rawTurn.startedAt : Date.now();
  const completedAt =
    typeof rawTurn.completedAt === "number" ? rawTurn.completedAt : undefined;
  const status =
    rawTurn.status === "streaming" ||
    rawTurn.status === "done" ||
    rawTurn.status === "stopped" ||
    rawTurn.status === "error"
      ? rawTurn.status
      : "done";

  const bodySegments = Array.isArray(rawTurn.bodySegments)
    ? rawTurn.bodySegments.flatMap((segment) => {
        if (!isRecord(segment)) {
          return [];
        }

        return [
          {
            id: typeof segment.id === "string" ? segment.id : makeId("segment"),
            text: typeof segment.text === "string" ? segment.text : "",
          },
        ];
      })
    : [];

  const processSteps = Array.isArray(rawTurn.processSteps)
    ? rawTurn.processSteps.reduce<ProcessStep[]>((steps, step) => {
        if (!isRecord(step)) {
          return steps;
        }

        if (step.type === "thinking" && isRecord(step.thinking)) {
          steps.push({
            type: "thinking",
            thinking: {
              id:
                typeof step.thinking.id === "string"
                  ? step.thinking.id
                  : makeId("thinking"),
              content:
                typeof step.thinking.content === "string"
                  ? step.thinking.content
                  : "",
              startedAt:
                typeof step.thinking.startedAt === "number"
                  ? step.thinking.startedAt
                  : startedAt,
              completedAt:
                typeof step.thinking.completedAt === "number"
                  ? step.thinking.completedAt
                  : undefined,
            },
          });
          return steps;
        }

        if (step.type === "tool" && isRecord(step.tool)) {
          steps.push({
            type: "tool",
            tool: {
              id:
                typeof step.tool.id === "string" ? step.tool.id : makeId("tool"),
              name:
                typeof step.tool.name === "string" ? step.tool.name : "unknown",
              input:
                typeof step.tool.input === "string" ? step.tool.input : "",
              result:
                typeof step.tool.result === "string" ? step.tool.result : undefined,
              status:
                step.tool.status === "done" ||
                step.tool.status === "error" ||
                step.tool.status === "running"
                  ? step.tool.status
                  : "running",
              startedAt:
                typeof step.tool.startedAt === "number"
                  ? step.tool.startedAt
                  : startedAt,
              completedAt:
                typeof step.tool.completedAt === "number"
                  ? step.tool.completedAt
                  : undefined,
            },
          });
        }

        return steps;
      }, [])
    : [];

  return {
    id: typeof rawTurn.id === "string" ? rawTurn.id : makeId("turn"),
    processSteps,
    bodySegments,
    actions: toAssistantActions(rawTurn.actions),
    status,
    error: typeof rawTurn.error === "string" ? rawTurn.error : undefined,
    startedAt,
    completedAt,
  };
}

function applyToolResultToTurn(
  turn: AssistantTurn,
  toolUseId: string,
  result: string,
  isError: boolean,
  completedAt?: number,
  assistantActions?: AssistantAction[]
) {
  if (!turn.processSteps.some((step) => step.type === "tool" && step.tool.id === toolUseId)) {
    return turn;
  }

  return {
    ...turn,
    actions: mergeAssistantActions(turn.actions, assistantActions),
    processSteps: turn.processSteps.map<ProcessStep>((step) =>
      step.type === "tool" && step.tool.id === toolUseId
        ? {
            type: "tool",
            tool: {
              ...step.tool,
              result,
              status: isError ? "error" : "done",
              completedAt: step.tool.completedAt ?? completedAt ?? turn.completedAt,
            },
          }
        : step
    ),
  };
}

function restoreLegacyAssistantBlock(message: unknown): ConversationMessage | null {
  if (!isRecord(message)) {
    return null;
  }

  const now = Date.now();
  const turnId = typeof message.id === "string" ? message.id : makeId("turn");
  const status =
    message.status === "streaming" ||
    message.status === "done" ||
    message.status === "stopped" ||
    message.status === "error"
      ? message.status
      : "done";

  const turn: AssistantTurn = {
    id: turnId,
    processSteps: [],
    bodySegments: [],
    status,
    error: typeof message.error === "string" ? message.error : undefined,
    startedAt: now,
    completedAt: status === "streaming" ? undefined : now,
  };

  if (message.type === "thinking" && typeof message.thinking === "string") {
    turn.processSteps.push({
      type: "thinking",
      thinking: {
        id: makeId("thinking"),
        content: message.thinking,
        startedAt: now,
        completedAt: turn.completedAt,
      },
    });
  } else if (message.type === "tool_use") {
    turn.processSteps.push({
      type: "tool",
      tool: {
        id: typeof message.toolUseId === "string" ? message.toolUseId : makeId("tool"),
        name: typeof message.toolName === "string" ? message.toolName : "unknown",
        input: typeof message.toolInput === "string" ? message.toolInput : "",
        result:
          typeof message.toolResult === "string" ? message.toolResult : undefined,
        status:
          message.toolStatus === "done" ||
          message.toolStatus === "error" ||
          message.toolStatus === "running"
            ? message.toolStatus
            : "running",
        startedAt: now,
        completedAt:
          typeof message.toolResult === "string" || message.toolStatus === "done"
            ? now
            : undefined,
      },
    });
  }

  if (typeof message.text === "string" && message.text.length > 0) {
    turn.bodySegments.push({
      id: makeId("segment"),
      text: message.text,
    });
  }

  return createAssistantMessageFromTurn(turn);
}

export async function saveAttachments(
  sessionId: string,
  attachments: FileAttachment[],
  workspaceId = "default"
): Promise<SavedAttachmentMeta[]> {
  if (attachments.length === 0) {
    return [];
  }

  await ensureSessionsDir(workspaceId);
  const attachmentsDir = getAttachmentsDir(sessionId, workspaceId);
  await mkdir(attachmentsDir, { recursive: true });

  const savedMetas: SavedAttachmentMeta[] = [];

  for (const attachment of attachments) {
    const originalName = path.basename(attachment.name);
    const savedFileName = `${attachment.id}-${originalName}`;
    const destinationPath = path.join(attachmentsDir, savedFileName);

    try {
      if (attachment.localPath) {
        try {
          await copyFile(attachment.localPath, destinationPath);
        } catch (error) {
          if (!attachment.base64Data) {
            throw error;
          }

          await writeFile(destinationPath, Buffer.from(attachment.base64Data, "base64"));
        }
      } else if (attachment.base64Data) {
        await writeFile(destinationPath, Buffer.from(attachment.base64Data, "base64"));
      } else {
        continue;
      }

      savedMetas.push({
        id: attachment.id,
        name: originalName,
        category: attachment.category,
        mimeType: attachment.mimeType,
        size: attachment.size,
        savedFileName,
      });
    } catch (error) {
      logSystemEvent(
        "store",
        "session",
        "attachment:save:error",
        "保存会话附件失败",
        {
          sessionId,
          workspaceId,
          attachment: attachment.name,
          error: getErrorMessage(error),
        },
        { level: "error" }
      );
    }
  }

  return savedMetas;
}

export async function appendMessageRecord(
  sessionId: string,
  record: MessageRecord,
  workspaceId = "default"
): Promise<void> {
  await ensureSessionsDir(workspaceId);
  await appendFile(
    getJsonlPath(sessionId, workspaceId),
    `${JSON.stringify(record)}\n`,
    "utf8"
  );
}

export async function loadMessages(
  sessionId: string,
  workspaceId = "default"
): Promise<ConversationMessage[]> {
  await ensureSessionsDir(workspaceId);

  let content: string;

  try {
    content = await readFile(getJsonlPath(sessionId, workspaceId), "utf8");
  } catch {
    return [];
  }

  const messages: ConversationMessage[] = [];
  let restoredInlineImageCount = 0;

  for (const line of content.split("\n")) {
    if (line.trim().length === 0) {
      continue;
    }

    try {
      const record = JSON.parse(line) as MessageRecord | {
        kind: "assistant_block";
        message: unknown;
      };

      if (record.kind === "assistant_turn") {
        const turn = normalizeTurn(record.turn);
        if (turn) {
          const lastMessage = messages.at(-1);

          if (lastMessage?.role === "assistant" && lastMessage.turn) {
            messages[messages.length - 1] = {
              ...lastMessage,
              turn: mergeAssistantTurns(lastMessage.turn, turn),
            };
          } else {
            messages.push(createAssistantMessageFromTurn(turn));
          }
        }
        continue;
      }

      if (record.kind === "assistant_block") {
        const legacyMessage = restoreLegacyAssistantBlock(record.message);
        if (legacyMessage) {
          messages.push(legacyMessage);
        }
        continue;
      }

      if (record.kind === "user") {
        const { attachments, ...message } = record.message;
        const restoredMessage: ConversationMessage = {
          id: typeof message.id === "string" ? message.id : makeId("user"),
          role: "user",
          text: typeof message.text === "string" ? message.text : undefined,
          timestamp:
            typeof message.timestamp === "number" ? message.timestamp : Date.now(),
        };

        if (Array.isArray(attachments) && attachments.length > 0) {
          const restoredAttachments: FileAttachment[] = [];

          for (const meta of attachments) {
            const filePath = getAttachmentPath(
              sessionId,
              meta.savedFileName,
              workspaceId
            );

            try {
              await access(filePath);
            } catch {
              continue;
            }

            const restoredAttachment: FileAttachment = {
              id: meta.id,
              name: meta.name,
              category: meta.category,
              mimeType: meta.mimeType,
              size: meta.size,
              localPath: filePath,
            };

            if (
              meta.category === "image" &&
              meta.size <= HISTORY_IMAGE_MAX_INLINE_BYTES &&
              restoredInlineImageCount < HISTORY_IMAGE_BASE64_LIMIT
            ) {
              try {
                restoredAttachment.base64Data = (
                  await readFile(filePath)
                ).toString("base64");
                restoredInlineImageCount += 1;
              } catch {
                // Ignore image preview load failures and keep the placeholder state.
              }
            }

            restoredAttachments.push(restoredAttachment);
          }

          if (restoredAttachments.length > 0) {
            restoredMessage.attachments = restoredAttachments;
          }
        }

        messages.push(restoredMessage);
        continue;
      }

      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message.role !== "assistant" || !message.turn) {
          continue;
        }

        if (
          !message.turn.processSteps.some(
            (step) => step.type === "tool" && step.tool.id === record.toolUseId
          )
        ) {
          continue;
        }

        messages[index] = {
          ...message,
          turn: applyToolResultToTurn(
            message.turn,
            record.toolUseId,
            record.result,
            record.isError,
            record.completedAt,
            mergeAssistantActions(
              toAssistantActions(record.assistantActions),
              extractAssistantActionsFromToolResult(record.result)
            )
          ),
        };
        break;
      }
    } catch {
      // Ignore malformed lines so one bad record does not block loading.
    }
  }

  return messages;
}

export function persistAssistantMessage(
  sessionId: string,
  sdkMessage: unknown,
  workspaceId = "default"
): void {
  if (!isRecord(sdkMessage) || !Array.isArray(sdkMessage.content)) {
    return;
  }

  const startedAt = Date.now();
  const turn: AssistantTurn = {
    id: makeId("turn"),
    processSteps: [],
    bodySegments: [],
    status: "done",
    startedAt,
    completedAt: startedAt,
  };

  for (const block of sdkMessage.content) {
    if (!isRecord(block)) {
      continue;
    }

    if (block.type === "text" && typeof block.text === "string") {
      turn.bodySegments.push({
        id: typeof block.id === "string" ? block.id : makeId("segment"),
        text: block.text,
      });
      continue;
    }

    if (block.type === "thinking" && typeof block.thinking === "string") {
      turn.processSteps.push({
        type: "thinking",
        thinking: {
          id: typeof block.id === "string" ? block.id : makeId("thinking"),
          content: block.thinking,
          startedAt,
          completedAt: startedAt,
        },
      });
      continue;
    }

    if (block.type === "tool_use") {
      turn.processSteps.push({
        type: "tool",
        tool: {
          id: typeof block.id === "string" ? block.id : makeId("tool"),
          name: typeof block.name === "string" ? block.name : "unknown",
          input: stringifyPersistedValue(block.input),
          status: "running",
          startedAt,
        },
      });
    }
  }

  if (turn.processSteps.length === 0 && turn.bodySegments.length === 0) {
    return;
  }

  void appendMessageRecord(
    sessionId,
    {
      kind: "assistant_turn",
      turn,
    },
    workspaceId
  );
}

export function persistToolResults(
  sessionId: string,
  sdkMessage: unknown,
  workspaceId = "default"
): void {
  if (typeof sdkMessage !== "object" || sdkMessage === null) {
    return;
  }

  const content = (sdkMessage as Record<string, unknown>).content;
  if (!Array.isArray(content)) {
    return;
  }

  for (const block of content) {
    if (typeof block !== "object" || block === null) {
      continue;
    }

    const item = block as Record<string, unknown>;
    if (item.type !== "tool_result" || typeof item.tool_use_id !== "string") {
      continue;
    }

    const assistantActions = extractAssistantActionsFromToolResult(item.content);

    void appendMessageRecord(sessionId, {
      kind: "tool_result",
      toolUseId: item.tool_use_id,
      result:
        typeof item.content === "string"
          ? item.content
          : JSON.stringify(item.content ?? ""),
      isError: item.is_error === true,
      completedAt: Date.now(),
      assistantActions:
        assistantActions.length > 0 ? assistantActions : undefined,
    }, workspaceId);
  }
}
