import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const tempHomes = new Set<string>();

function createTempHome() {
  const homeDir = mkdtempSync(path.join(tmpdir(), "zora-memory-"));
  tempHomes.add(homeDir);
  return homeDir;
}

async function loadMemoryStore(homeDir: string) {
  vi.resetModules();

  vi.doMock("node:os", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:os")>();
    return {
      ...actual,
      homedir: () => homeDir,
    };
  });

  return import("@/main/memory-store");
}

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock("node:os");
  vi.resetModules();

  for (const homeDir of tempHomes) {
    rmSync(homeDir, { recursive: true, force: true });
  }
  tempHomes.clear();
});

describe("main memory-store", () => {
  it("resolves the default zora paths and token estimate", async () => {
    const homeDir = createTempHome();
    const {
      DEFAULT_ZORA_ID,
      estimateTokens,
      getZoraDirPath,
      getZoraMemoryDirPath,
    } = await loadMemoryStore(homeDir);

    expect(DEFAULT_ZORA_ID).toBe("default");
    expect(getZoraDirPath()).toBe(path.join(homeDir, ".zora", "zoras", "default"));
    expect(getZoraMemoryDirPath("custom")).toBe(
      path.join(homeDir, ".zora", "zoras", "custom", "memory")
    );
    expect(estimateTokens("abcdef")).toBe(2);
  });

  it("creates the bootstrap scaffold and memory directory", async () => {
    const homeDir = createTempHome();
    const {
      ensureBootstrapScaffold,
      getZoraDirPath,
      getZoraMemoryDirPath,
      loadFile,
    } = await loadMemoryStore(homeDir);

    const createdFiles = await ensureBootstrapScaffold();

    expect(createdFiles).toEqual(["SOUL.md", "IDENTITY.md", "USER.md"]);
    expect(existsSync(getZoraDirPath())).toBe(true);
    expect(existsSync(getZoraMemoryDirPath())).toBe(true);
    await expect(loadFile("SOUL.md")).resolves.toContain("# SOUL.md");
    await expect(loadFile("IDENTITY.md")).resolves.toContain("# IDENTITY.md");
    await expect(loadFile("USER.md")).resolves.toContain("# USER.md");
  });

  it("preserves non-empty scaffold files and only fills missing or empty ones", async () => {
    const homeDir = createTempHome();
    const {
      ensureBootstrapScaffold,
      loadFile,
      saveFile,
    } = await loadMemoryStore(homeDir);

    await saveFile("SOUL.md", "Custom soul");
    await saveFile("IDENTITY.md", "");

    const createdFiles = await ensureBootstrapScaffold();

    expect(createdFiles).toEqual(["IDENTITY.md", "USER.md"]);
    await expect(loadFile("SOUL.md")).resolves.toBe("Custom soul");
    await expect(loadFile("IDENTITY.md")).resolves.toContain("# IDENTITY.md");
    await expect(loadFile("USER.md")).resolves.toContain("# USER.md");
  });

  it("supports saving, loading, checking, and listing zora files", async () => {
    const homeDir = createTempHome();
    const {
      getZoraDirPath,
      hasFile,
      listFiles,
      loadFile,
      saveFile,
    } = await loadMemoryStore(homeDir);

    await saveFile("beta.md", "beta");
    await saveFile("alpha.md", "alpha");
    mkdirSync(path.join(getZoraDirPath(), "ignored-dir"), { recursive: true });

    await expect(loadFile("alpha.md")).resolves.toBe("alpha");
    await expect(hasFile("alpha.md")).resolves.toBe(true);
    await expect(hasFile("missing.md")).resolves.toBe(false);
    await expect(listFiles()).resolves.toEqual(["alpha.md", "beta.md"]);

    expect(readdirSync(getZoraDirPath()).sort()).toContain("ignored-dir");
  });

  it("appends daily logs and loads recent history", async () => {
    const homeDir = createTempHome();
    vi.useFakeTimers();

    const {
      appendDailyLog,
      isBootstrapped,
      loadDailyLog,
      loadRecentLogs,
      saveFile,
    } = await loadMemoryStore(homeDir);

    vi.setSystemTime(new Date("2026-04-23T08:15:00+08:00"));
    await appendDailyLog("- planned launch");

    vi.setSystemTime(new Date("2026-04-24T09:45:00+08:00"));
    await appendDailyLog("- reviewed feedback");
    await saveFile("SOUL.md", "");

    await expect(loadDailyLog("2026-04-23")).resolves.toContain("### 08:15");
    await expect(loadDailyLog("2026-04-24")).resolves.toContain("### 09:45");
    await expect(loadRecentLogs(2)).resolves.toBe(
      "## 2026-04-23\n### 08:15\n- planned launch\n\n## 2026-04-24\n### 09:45\n- reviewed feedback"
    );
    await expect(loadRecentLogs(0)).resolves.toBeNull();
    await expect(isBootstrapped()).resolves.toBe(true);
  });
});
