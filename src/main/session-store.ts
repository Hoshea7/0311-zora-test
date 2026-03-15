import { randomUUID } from "node:crypto";
import {
  access,
  appendFile,
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
import type { ChatMessage, FileAttachment } from "../shared/zora";

export interface SessionMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  sdkSessionId?: string;
}

export interface SavedAttachmentMeta {
  id: string;
  name: string;
  category: "image" | "document" | "text";
  mimeType: string;
  size: number;
  savedFileName: string;
}

const ZORA_DIR = path.join(homedir(), ".zora");
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
    console.log("[session-store] New sessions dir already exists, skipping migration.");
    return;
  } catch {
    // The workspace-aware directory does not exist yet, continue migrating.
  }

  await mkdir(path.join(ZORA_DIR, "workspaces", "default"), { recursive: true });
  await fsRename(OLD_SESSIONS_DIR, newDir);
  console.log(
    "[session-store] Migrated sessions from ~/.zora/sessions/ to ~/.zora/workspaces/default/sessions/."
  );
}

async function ensureSessionsDir(workspaceId = "default"): Promise<void> {
  await migrateSessionsIfNeeded();
  await mkdir(getSessionsDir(workspaceId), { recursive: true });
}

async function replaceFileAtomically(
  filePath: string,
  content: string
): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, content, "utf8");

  try {
    await fsRename(tmpPath, filePath);
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code: string }).code
        : "";

    if (code === "EEXIST" || code === "EPERM") {
      try {
        await unlink(filePath);
      } catch {
        // Ignore missing destination files.
      }

      await fsRename(tmpPath, filePath);
      return;
    }

    try {
      await unlink(tmpPath);
    } catch {
      // Ignore temp cleanup failures.
    }

    throw error;
  }
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

export async function listSessions(workspaceId = "default"): Promise<SessionMeta[]> {
  await ensureSessionsDir(workspaceId);
  return readIndex(workspaceId);
}

export async function createSession(
  title: string,
  workspaceId = "default"
): Promise<SessionMeta> {
  await ensureSessionsDir(workspaceId);

  const now = new Date().toISOString();
  const meta: SessionMeta = {
    id: randomUUID(),
    title,
    createdAt: now,
    updatedAt: now,
  };

  const sessions = await readIndex(workspaceId);
  sessions.unshift(meta);
  await writeIndex(sessions, workspaceId);
  return meta;
}

export async function deleteSession(
  sessionId: string,
  workspaceId = "default"
): Promise<void> {
  await ensureSessionsDir(workspaceId);

  const sessions = await readIndex(workspaceId);
  const filtered = sessions.filter((session) => session.id !== sessionId);
  await writeIndex(filtered, workspaceId);

  try {
    await unlink(getJsonlPath(sessionId, workspaceId));
  } catch {
    // Ignore missing message files so metadata cleanup can still succeed.
  }

  try {
    await rm(getAttachmentsDir(sessionId, workspaceId), {
      recursive: true,
      force: true,
    });
  } catch {
    // Ignore attachment cleanup failures so metadata cleanup can still succeed.
  }
}

export async function updateSessionMeta(
  sessionId: string,
  updates: Partial<Pick<SessionMeta, "title" | "sdkSessionId">>,
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

type MessageRecord =
  | {
      kind: "user";
      message: Omit<ChatMessage, "attachments"> & {
        attachments?: SavedAttachmentMeta[];
      };
    }
  | { kind: "assistant_block"; message: ChatMessage }
  | { kind: "tool_result"; toolUseId: string; result: string; isError: boolean };

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
      console.error(
        `[session-store] Failed to save attachment "${attachment.name}" for session ${sessionId}.`,
        error
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
): Promise<ChatMessage[]> {
  await ensureSessionsDir(workspaceId);

  let content: string;

  try {
    content = await readFile(getJsonlPath(sessionId, workspaceId), "utf8");
  } catch {
    return [];
  }

  const messages: ChatMessage[] = [];
  let restoredInlineImageCount = 0;

  for (const line of content.split("\n")) {
    if (line.trim().length === 0) {
      continue;
    }

    try {
      const record = JSON.parse(line) as MessageRecord;

      if (record.kind === "assistant_block") {
        messages.push(record.message);
        continue;
      }

      if (record.kind === "user") {
        const { attachments, ...message } = record.message;
        const restoredMessage: ChatMessage = { ...message };

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
        if (messages[index].toolUseId === record.toolUseId) {
          messages[index] = {
            ...messages[index],
            toolResult: record.result,
            toolStatus: record.isError ? "error" : "done",
          };
          break;
        }
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

    if (item.type === "text" && typeof item.text === "string") {
      void appendMessageRecord(sessionId, {
        kind: "assistant_block",
        message: {
          id: makeId("text"),
          role: "assistant",
          type: "text",
          text: item.text,
          thinking: "",
          status: "done",
        },
      }, workspaceId);
      continue;
    }

    if (item.type === "thinking" && typeof item.thinking === "string") {
      void appendMessageRecord(sessionId, {
        kind: "assistant_block",
        message: {
          id: makeId("thinking"),
          role: "assistant",
          type: "thinking",
          text: "",
          thinking: item.thinking,
          status: "done",
        },
      }, workspaceId);
      continue;
    }

    if (item.type === "tool_use") {
      void appendMessageRecord(sessionId, {
        kind: "assistant_block",
        message: {
          id: makeId("tooluse"),
          role: "assistant",
          type: "tool_use",
          text: "",
          thinking: "",
          toolName: typeof item.name === "string" ? item.name : "unknown",
          toolUseId: typeof item.id === "string" ? item.id : "",
          toolInput:
            typeof item.input === "string"
              ? item.input
              : JSON.stringify(item.input ?? ""),
          toolResult: "",
          toolStatus: "running",
          status: "done",
        },
      }, workspaceId);
    }
  }
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

    void appendMessageRecord(sessionId, {
      kind: "tool_result",
      toolUseId: item.tool_use_id,
      result:
        typeof item.content === "string"
          ? item.content
          : JSON.stringify(item.content ?? ""),
      isError: item.is_error === true,
    }, workspaceId);
  }
}
