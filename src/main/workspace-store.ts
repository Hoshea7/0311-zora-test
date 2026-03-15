import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename as fsRename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { WorkspaceMeta } from "../shared/zora";

const DEFAULT_WORKSPACE_ID = "default";
const ZORA_DIR = path.join(homedir(), ".zora");
const WORKSPACES_FILE = path.join(ZORA_DIR, "workspaces.json");
const WORKSPACE_DATA_ROOT = path.join(ZORA_DIR, "workspaces");

function createDefaultWorkspace(
  existing?: Partial<WorkspaceMeta>
): WorkspaceMeta {
  const now = new Date().toISOString();

  return {
    id: DEFAULT_WORKSPACE_ID,
    name: "默认工作区",
    path: homedir(),
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

async function readWorkspaceFile(): Promise<WorkspaceMeta[]> {
  try {
    const raw = await readFile(WORKSPACES_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isWorkspaceMeta);
  } catch {
    return [];
  }
}

async function writeWorkspaceFile(workspaces: WorkspaceMeta[]): Promise<void> {
  await ensureZoraDir();
  await replaceFileAtomically(
    WORKSPACES_FILE,
    JSON.stringify(workspaces, null, 2)
  );
}

function getWorkspaceDataDir(workspaceId: string): string {
  return path.join(WORKSPACE_DATA_ROOT, workspaceId);
}

export async function listWorkspaces(): Promise<WorkspaceMeta[]> {
  await ensureZoraDir();

  const rawWorkspaces = await readWorkspaceFile();
  const normalized = normalizeWorkspaces(rawWorkspaces);

  if (JSON.stringify(rawWorkspaces) !== JSON.stringify(normalized)) {
    await writeWorkspaceFile(normalized);
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
