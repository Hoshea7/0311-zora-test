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

export function isEnoentError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

export async function replaceFileAtomically(filePath: string, content: string): Promise<void> {
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
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code: string }).code
        : "";

    if (code === "EEXIST" || code === "EPERM") {
      try {
        await unlink(filePath);
      } catch {
        // Ignore missing destination file.
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
      } catch {
        // Ignore temp cleanup failures.
      }
    }
  }
}

export async function ensureZoraDir(): Promise<void> {
  await mkdir(ZORA_DIR, { recursive: true });
}
