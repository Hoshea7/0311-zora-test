import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { rename as actualRename } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const tempHomes = new Set<string>();

function createTempHome() {
  const homeDir = mkdtempSync(path.join(tmpdir(), "zora-fs-"));
  tempHomes.add(homeDir);
  return homeDir;
}

async function loadFsModule(options: {
  homeDir: string;
  fsPromisesOverride?: (
    actual: typeof import("node:fs/promises")
  ) => Partial<typeof import("node:fs/promises")>;
}) {
  vi.resetModules();

  vi.doMock("node:os", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:os")>();
    return {
      ...actual,
      homedir: () => options.homeDir,
    };
  });

  if (options.fsPromisesOverride) {
    vi.doMock("node:fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:fs/promises")>();
      return {
        ...actual,
        ...options.fsPromisesOverride(actual),
      };
    });
  } else {
    vi.doUnmock("node:fs/promises");
  }

  return import("@/main/utils/fs");
}

afterEach(() => {
  vi.doUnmock("node:os");
  vi.doUnmock("node:fs/promises");
  vi.resetModules();

  for (const homeDir of tempHomes) {
    rmSync(homeDir, { recursive: true, force: true });
  }
  tempHomes.clear();
});

describe("main utils/fs", () => {
  it("detects ENOENT-shaped errors", async () => {
    const { isEnoentError } = await loadFsModule({ homeDir: createTempHome() });

    expect(isEnoentError({ code: "ENOENT" })).toBe(true);
    expect(isEnoentError({ code: "EACCES" })).toBe(false);
    expect(isEnoentError("ENOENT")).toBe(false);
  });

  it("writes files atomically", async () => {
    const { replaceFileAtomically } = await loadFsModule({
      homeDir: createTempHome(),
    });
    const filePath = path.join(createTempHome(), "note.txt");

    await replaceFileAtomically(filePath, "hello world");

    expect(readFileSync(filePath, "utf8")).toBe("hello world");
    expect(existsSync(`${filePath}.tmp`)).toBe(false);
  });

  it("retries replace when rename hits a replace-style error", async () => {
    const homeDir = createTempHome();
    const filePath = path.join(homeDir, "note.txt");
    writeFileSync(filePath, "old content", "utf8");

    const renameMock = vi.fn(async (from: string, to: string) => {
      if (renameMock.mock.calls.length === 1) {
        throw Object.assign(new Error("busy"), { code: "EPERM" });
      }

      return actualRename(from, to);
    });

    const { replaceFileAtomically } = await loadFsModule({
      homeDir,
      fsPromisesOverride: () => ({
        rename: renameMock,
      }),
    });

    await replaceFileAtomically(filePath, "new content");

    expect(readFileSync(filePath, "utf8")).toBe("new content");
    expect(renameMock).toHaveBeenCalledTimes(2);
    expect(existsSync(`${filePath}.tmp`)).toBe(false);
  });

  it("cleans up the temp file when rename fails unexpectedly", async () => {
    const homeDir = createTempHome();
    const filePath = path.join(homeDir, "note.txt");

    const renameMock = vi.fn(async () => {
      throw Object.assign(new Error("boom"), { code: "EINVAL" });
    });

    const { replaceFileAtomically } = await loadFsModule({
      homeDir,
      fsPromisesOverride: () => ({
        rename: renameMock,
      }),
    });

    await expect(replaceFileAtomically(filePath, "new content")).rejects.toThrow("boom");
    expect(existsSync(`${filePath}.tmp`)).toBe(false);
  });

  it("creates the ~/.zora directory under the mocked home path", async () => {
    const homeDir = createTempHome();
    const { ZORA_DIR, ensureZoraDir } = await loadFsModule({ homeDir });

    await ensureZoraDir();

    expect(ZORA_DIR).toBe(path.join(homeDir, ".zora"));
    expect(existsSync(ZORA_DIR)).toBe(true);
  });
});
