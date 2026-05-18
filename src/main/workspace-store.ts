import { randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { WorkspaceMeta } from "../shared/zora";
import { isEnoentError, replaceFileAtomically, ZORA_DIR } from "./utils/fs";

export const DEFAULT_WORKSPACE_ID = "default";
const WORKSPACES_FILE = path.join(ZORA_DIR, "workspaces.json");
const WORKSPACE_DATA_ROOT = path.join(ZORA_DIR, "workspaces");
const WORKSPACE_SIDECAR_FILE = "workspace.json";
const SESSIONS_INDEX_FILE = path.join("sessions", "index.json");

type WorkspaceFileReadResult = {
  workspaces: WorkspaceMeta[];
  shouldRewrite: boolean;
};

function createDefaultWorkspace(
  existing?: Partial<WorkspaceMeta>
): WorkspaceMeta {
  const now = new Date().toISOString();

  return {
    id: DEFAULT_WORKSPACE_ID,
    name: "默认工作区",
    path: getWorkspaceFilesDir(DEFAULT_WORKSPACE_ID),
    createdAt: existing?.createdAt ?? now,
    updatedAt: existing?.updatedAt ?? existing?.createdAt ?? now,
  };
}

function isWorkspaceMeta(value: unknown): value is WorkspaceMeta {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as WorkspaceMeta).id === "string" &&
    typeof (value as WorkspaceMeta).name === "string" &&
    typeof (value as WorkspaceMeta).path === "string" &&
    typeof (value as WorkspaceMeta).createdAt === "string" &&
    typeof (value as WorkspaceMeta).updatedAt === "string"
  );
}

function timestampForFileName(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function normalizeWorkspaces(workspaces: WorkspaceMeta[]): WorkspaceMeta[] {
  const defaultWorkspace = workspaces.find(
    (workspace) => workspace.id === DEFAULT_WORKSPACE_ID
  );
  const seenIds = new Set<string>([DEFAULT_WORKSPACE_ID]);
  const others: WorkspaceMeta[] = [];

  for (const workspace of workspaces) {
    if (
      workspace.id === DEFAULT_WORKSPACE_ID ||
      workspace.id.trim().length === 0 ||
      workspace.name.trim().length === 0 ||
      workspace.path.trim().length === 0 ||
      seenIds.has(workspace.id)
    ) {
      continue;
    }

    seenIds.add(workspace.id);
    others.push(workspace);
  }

  return [createDefaultWorkspace(defaultWorkspace), ...others];
}

async function ensureZoraDir(): Promise<void> {
  await mkdir(ZORA_DIR, { recursive: true });
  await mkdir(WORKSPACE_DATA_ROOT, { recursive: true });
  await mkdir(getWorkspaceDataDir(DEFAULT_WORKSPACE_ID), { recursive: true });
  await mkdir(getWorkspaceFilesDir(DEFAULT_WORKSPACE_ID), { recursive: true });
}

async function backupWorkspaceFile(reason: string): Promise<void> {
  const backupPath = `${WORKSPACES_FILE}.${reason}-${timestampForFileName()}.bak`;

  try {
    await copyFile(WORKSPACES_FILE, backupPath);
    console.warn(`[workspace-store] Backed up workspaces.json to ${backupPath}.`);
  } catch (error) {
    if (!isEnoentError(error)) {
      console.warn("[workspace-store] Failed to back up workspaces.json.", error);
    }
  }
}

async function readWorkspaceFile(): Promise<WorkspaceFileReadResult> {
  try {
    const raw = await readFile(WORKSPACES_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      await backupWorkspaceFile("invalid");
      console.warn(
        "[workspace-store] workspaces.json is not an array; recovering from workspace data dirs."
      );
      return { workspaces: [], shouldRewrite: true };
    }

    const validWorkspaces = parsed.filter(isWorkspaceMeta);
    const shouldRewrite = validWorkspaces.length !== parsed.length;

    if (shouldRewrite) {
      await backupWorkspaceFile("invalid-entries");
      console.warn(
        `[workspace-store] Dropped ${parsed.length - validWorkspaces.length} invalid workspace record(s).`
      );
    }

    return { workspaces: validWorkspaces, shouldRewrite };
  } catch (error) {
    if (isEnoentError(error)) {
      return { workspaces: [], shouldRewrite: true };
    }

    if (error instanceof SyntaxError) {
      await backupWorkspaceFile("corrupt");
      console.warn(
        "[workspace-store] workspaces.json is invalid JSON; recovering from workspace data dirs.",
        error
      );
      return { workspaces: [], shouldRewrite: true };
    }

    throw error;
  }
}

async function writeWorkspaceFile(workspaces: WorkspaceMeta[]): Promise<void> {
  await ensureZoraDir();
  await replaceFileAtomically(
    WORKSPACES_FILE,
    JSON.stringify(workspaces, null, 2)
  );
  await persistWorkspaceSidecars(workspaces);
}

export function getWorkspaceDataDir(workspaceId: string): string {
  return path.join(WORKSPACE_DATA_ROOT, workspaceId);
}

export function getWorkspaceFilesDir(
  workspaceId = DEFAULT_WORKSPACE_ID
): string {
  return path.join(getWorkspaceDataDir(workspaceId), "files");
}

export function getWorkspaceSessionFilesDir(
  workspaceId: string,
  sessionId: string
): string {
  return path.join(getWorkspaceFilesDir(workspaceId), sessionId);
}

function getWorkspaceSidecarPath(workspaceId: string): string {
  return path.join(getWorkspaceDataDir(workspaceId), WORKSPACE_SIDECAR_FILE);
}

async function persistWorkspaceSidecar(workspace: WorkspaceMeta): Promise<void> {
  await mkdir(getWorkspaceDataDir(workspace.id), { recursive: true });
  await replaceFileAtomically(
    getWorkspaceSidecarPath(workspace.id),
    `${JSON.stringify(workspace, null, 2)}\n`
  );
}

async function persistWorkspaceSidecars(workspaces: WorkspaceMeta[]): Promise<void> {
  const results = await Promise.allSettled(
    workspaces.map((workspace) => persistWorkspaceSidecar(workspace))
  );

  for (const result of results) {
    if (result.status === "rejected") {
      console.warn("[workspace-store] Failed to persist workspace sidecar.", result.reason);
    }
  }
}

function isSameWorkspaceMeta(left: WorkspaceMeta | null, right: WorkspaceMeta): boolean {
  return left !== null && JSON.stringify(left) === JSON.stringify(right);
}

async function repairMissingWorkspaceSidecars(workspaces: WorkspaceMeta[]): Promise<void> {
  const results = await Promise.allSettled(
    workspaces.map(async (workspace) => {
      const sidecar = await readWorkspaceSidecar(workspace.id);

      if (isSameWorkspaceMeta(sidecar, workspace)) {
        return;
      }

      await persistWorkspaceSidecar(workspace);
    })
  );

  for (const result of results) {
    if (result.status === "rejected") {
      console.warn("[workspace-store] Failed to repair workspace sidecar.", result.reason);
    }
  }
}

async function readWorkspaceSidecar(workspaceId: string): Promise<WorkspaceMeta | null> {
  try {
    const raw = await readFile(getWorkspaceSidecarPath(workspaceId), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return isWorkspaceMeta(parsed) && parsed.id === workspaceId ? parsed : null;
  } catch (error) {
    if (isEnoentError(error) || error instanceof SyntaxError) {
      return null;
    }

    console.warn(
      `[workspace-store] Failed to read workspace sidecar for ${workspaceId}.`,
      error
    );
    return null;
  }
}

async function recoverWorkspaceFromSessionIndex(
  workspaceId: string
): Promise<WorkspaceMeta | null> {
  try {
    const raw = await readFile(
      path.join(getWorkspaceDataDir(workspaceId), SESSIONS_INDEX_FILE),
      "utf8"
    );
    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return null;
    }

    if (parsed.length === 0) {
      return null;
    }

    const now = new Date().toISOString();

    return {
      id: workspaceId,
      name: `恢复的工作区 ${workspaceId.slice(0, 8)}`,
      path: homedir(),
      createdAt: now,
      updatedAt: now,
    };
  } catch (error) {
    if (isEnoentError(error) || error instanceof SyntaxError) {
      return null;
    }

    console.warn(
      `[workspace-store] Failed to recover workspace ${workspaceId} from session index.`,
      error
    );
    return null;
  }
}

async function recoverWorkspacesFromDataDirs(
  existingWorkspaces: WorkspaceMeta[]
): Promise<WorkspaceMeta[]> {
  const existingIds = new Set(existingWorkspaces.map((workspace) => workspace.id));

  let entries;
  try {
    entries = await readdir(WORKSPACE_DATA_ROOT, { withFileTypes: true });
  } catch (error) {
    if (isEnoentError(error)) {
      return [];
    }

    throw error;
  }

  const recovered: WorkspaceMeta[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.trim().length === 0 || existingIds.has(entry.name)) {
      continue;
    }

    const sidecar = await readWorkspaceSidecar(entry.name);
    const workspace = sidecar ?? (await recoverWorkspaceFromSessionIndex(entry.name));
    if (!workspace) {
      continue;
    }

    console.warn(
      `[workspace-store] Recovered workspace ${workspace.id} (${workspace.name}) from data dir.`
    );
    recovered.push(workspace);
    existingIds.add(workspace.id);
  }

  return recovered;
}

export async function listWorkspaces(): Promise<WorkspaceMeta[]> {
  await ensureZoraDir();

  const workspaceFile = await readWorkspaceFile();
  const recoveredWorkspaces = await recoverWorkspacesFromDataDirs(workspaceFile.workspaces);
  const rawWorkspaces = [...workspaceFile.workspaces, ...recoveredWorkspaces];
  const normalized = normalizeWorkspaces(rawWorkspaces);

  if (
    workspaceFile.shouldRewrite ||
    recoveredWorkspaces.length > 0 ||
    JSON.stringify(rawWorkspaces) !== JSON.stringify(normalized)
  ) {
    await writeWorkspaceFile(normalized);
  } else {
    await repairMissingWorkspaceSidecars(normalized);
  }

  return normalized;
}

export async function createWorkspace(
  name: string,
  workspacePath: string
): Promise<WorkspaceMeta> {
  const nextName = name.trim();
  const nextPath = workspacePath.trim();

  if (!nextName) {
    throw new Error("Workspace name is required.");
  }

  if (!nextPath) {
    throw new Error("Workspace path is required.");
  }

  const workspaces = await listWorkspaces();
  const now = new Date().toISOString();
  const workspace: WorkspaceMeta = {
    id: randomUUID(),
    name: nextName,
    path: nextPath,
    createdAt: now,
    updatedAt: now,
  };

  await mkdir(nextPath, { recursive: true });
  await mkdir(getWorkspaceDataDir(workspace.id), { recursive: true });
  await writeWorkspaceFile([...workspaces, workspace]);

  return workspace;
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  if (workspaceId === DEFAULT_WORKSPACE_ID) {
    throw new Error("Default workspace cannot be deleted.");
  }

  const workspaces = await listWorkspaces();
  const filtered = workspaces.filter(
    (workspace) => workspace.id !== workspaceId
  );

  if (filtered.length === workspaces.length) {
    return;
  }

  await writeWorkspaceFile(filtered);
  await rm(getWorkspaceDataDir(workspaceId), { recursive: true, force: true });
}

export async function renameWorkspace(
  workspaceId: string,
  name: string
): Promise<WorkspaceMeta> {
  const nextName = name.trim();

  if (!nextName) {
    throw new Error("Workspace name is required.");
  }

  const workspaces = await listWorkspaces();
  const target = workspaces.find((workspace) => workspace.id === workspaceId);

  if (!target) {
    throw new Error(`Workspace ${workspaceId} does not exist.`);
  }

  const updated: WorkspaceMeta = {
    ...target,
    name: nextName,
    updatedAt: new Date().toISOString(),
  };

  await writeWorkspaceFile(
    workspaces.map((workspace) =>
      workspace.id === workspaceId ? updated : workspace
    )
  );

  return updated;
}

export async function getWorkspacePath(
  workspaceId = DEFAULT_WORKSPACE_ID
): Promise<string> {
  const workspaces = await listWorkspaces();
  const workspace = workspaces.find((item) => item.id === workspaceId);

  if (!workspace) {
    throw new Error(`Workspace ${workspaceId} does not exist.`);
  }

  return workspace.path;
}
