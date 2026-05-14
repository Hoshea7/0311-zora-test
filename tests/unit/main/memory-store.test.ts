import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
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
  it("resolves the Zora memory root without zoras/default", async () => {
    const homeDir = createTempHome();
    const {
      estimateTokens,
      getZoraDailyDirPath,
      getZoraMemoryDirPath,
    } = await loadMemoryStore(homeDir);

    expect(getZoraMemoryDirPath()).toBe(path.join(homeDir, ".zora", "memory"));
    expect(getZoraDailyDirPath()).toBe(path.join(homeDir, ".zora", "memory", "daily"));
    expect(getZoraMemoryDirPath()).not.toContain(path.join("zoras", "default"));
    expect(estimateTokens("abcdef")).toBe(2);
  });

  it("creates only the memory root and daily directory", async () => {
    const homeDir = createTempHome();
    const {
      ensureZoraDir,
      getZoraDailyDirPath,
      getZoraMemoryDirPath,
    } = await loadMemoryStore(homeDir);

    await ensureZoraDir();

    expect(existsSync(getZoraMemoryDirPath())).toBe(true);
    expect(existsSync(getZoraDailyDirPath())).toBe(true);
    expect(readdirSync(getZoraMemoryDirPath()).sort()).toEqual(["daily"]);
  });

  it("saves and loads USER.md and MEMORY.md from the new memory root", async () => {
    const homeDir = createTempHome();
    const {
      getZoraMemoryDirPath,
      hasFile,
      listFiles,
      loadFile,
      saveFile,
    } = await loadMemoryStore(homeDir);

    await saveFile("USER.md", "# USER.md\n\n称呼：天");
    await saveFile("MEMORY.md", "# MEMORY.md\n\n## Core Facts");

    await expect(loadFile("USER.md")).resolves.toContain("称呼：天");
    await expect(loadFile("MEMORY.md")).resolves.toContain("Core Facts");
    await expect(hasFile("USER.md")).resolves.toBe(true);
    await expect(hasFile("missing.md")).resolves.toBe(false);
    await expect(listFiles()).resolves.toEqual(["MEMORY.md", "USER.md"]);
    expect(readFileSync(path.join(getZoraMemoryDirPath(), "USER.md"), "utf8")).toContain("称呼：天");
    expect(existsSync(path.join(homeDir, ".zora", "zoras", "default", "USER.md"))).toBe(false);
  });

  it("does not allow SOUL.md or IDENTITY.md in the new memory structure", async () => {
    const homeDir = createTempHome();
    const {
      getZoraMemoryDirPath,
      saveFile,
    } = await loadMemoryStore(homeDir);

    await expect(saveFile("SOUL.md", "old soul")).rejects.toThrow(
      "not part of the Zora memory structure"
    );
    await expect(saveFile("IDENTITY.md", "old identity")).rejects.toThrow(
      "not part of the Zora memory structure"
    );
    expect(existsSync(path.join(getZoraMemoryDirPath(), "SOUL.md"))).toBe(false);
    expect(existsSync(path.join(getZoraMemoryDirPath(), "IDENTITY.md"))).toBe(false);
  });

  it("falls back to old zoras/default files only for reads", async () => {
    const homeDir = createTempHome();
    const {
      getLegacyZoraDirPath,
      getZoraMemoryDirPath,
      loadFile,
      saveFile,
    } = await loadMemoryStore(homeDir);

    mkdirSync(getLegacyZoraDirPath(), { recursive: true });
    writeFileSync(path.join(getLegacyZoraDirPath(), "USER.md"), "Legacy user", "utf8");

    await expect(loadFile("USER.md")).resolves.toBe("Legacy user");

    await saveFile("USER.md", "New user");

    await expect(loadFile("USER.md")).resolves.toBe("New user");
    expect(readFileSync(path.join(getZoraMemoryDirPath(), "USER.md"), "utf8")).toBe("New user");
    expect(readFileSync(path.join(getLegacyZoraDirPath(), "USER.md"), "utf8")).toBe("Legacy user");
  });

  it("migrates legacy USER.md, MEMORY.md, and daily logs without moving old files", async () => {
    const homeDir = createTempHome();
    const {
      getLegacyMemoryMigrationMarkerPath,
      getLegacyZoraDirPath,
      getLegacyZoraMemoryDirPath,
      getZoraDailyDirPath,
      getZoraMemoryDirPath,
      migrateLegacyMemoryIfNeeded,
    } = await loadMemoryStore(homeDir);

    mkdirSync(getLegacyZoraMemoryDirPath(), { recursive: true });
    writeFileSync(path.join(getLegacyZoraDirPath(), "USER.md"), "Legacy user", "utf8");
    writeFileSync(path.join(getLegacyZoraDirPath(), "MEMORY.md"), "Legacy memory", "utf8");
    writeFileSync(path.join(getLegacyZoraDirPath(), "SOUL.md"), "Old soul", "utf8");
    writeFileSync(path.join(getLegacyZoraDirPath(), "IDENTITY.md"), "Old identity", "utf8");
    writeFileSync(path.join(getLegacyZoraMemoryDirPath(), "2026-05-12.md"), "Daily log", "utf8");
    writeFileSync(path.join(getLegacyZoraMemoryDirPath(), "notes.md"), "Ignore me", "utf8");

    const result = await migrateLegacyMemoryIfNeeded();

    expect([...result.migrated].sort()).toEqual([
      "MEMORY.md",
      "USER.md",
      "daily/2026-05-12.md",
    ]);
    expect([...result.ignored].sort()).toEqual(["IDENTITY.md", "SOUL.md"]);
    expect(readFileSync(path.join(getZoraMemoryDirPath(), "USER.md"), "utf8")).toBe(
      "Legacy user"
    );
    expect(readFileSync(path.join(getZoraMemoryDirPath(), "MEMORY.md"), "utf8")).toBe(
      "Legacy memory"
    );
    expect(readFileSync(path.join(getZoraDailyDirPath(), "2026-05-12.md"), "utf8")).toBe(
      "Daily log"
    );
    expect(existsSync(path.join(getZoraMemoryDirPath(), "SOUL.md"))).toBe(false);
    expect(existsSync(path.join(getZoraMemoryDirPath(), "IDENTITY.md"))).toBe(false);
    expect(readFileSync(path.join(getLegacyZoraDirPath(), "USER.md"), "utf8")).toBe(
      "Legacy user"
    );

    const marker = JSON.parse(readFileSync(getLegacyMemoryMigrationMarkerPath(), "utf8"));
    expect(marker.version).toBe(1);
    expect(marker.migrated).toEqual(result.migrated);
    expect(marker.ignored).toEqual(result.ignored);
  });

  it("does not overwrite existing new memory during legacy migration", async () => {
    const homeDir = createTempHome();
    const {
      getLegacyZoraDirPath,
      getLegacyZoraMemoryDirPath,
      getZoraDailyDirPath,
      getZoraMemoryDirPath,
      migrateLegacyMemoryIfNeeded,
      saveFile,
    } = await loadMemoryStore(homeDir);

    await saveFile("USER.md", "Current user");
    mkdirSync(getZoraDailyDirPath(), { recursive: true });
    writeFileSync(path.join(getZoraDailyDirPath(), "2026-05-12.md"), "Current daily", "utf8");

    mkdirSync(getLegacyZoraMemoryDirPath(), { recursive: true });
    writeFileSync(path.join(getLegacyZoraDirPath(), "USER.md"), "Legacy user", "utf8");
    writeFileSync(path.join(getLegacyZoraDirPath(), "MEMORY.md"), "Legacy memory", "utf8");
    writeFileSync(path.join(getLegacyZoraMemoryDirPath(), "2026-05-12.md"), "Legacy daily", "utf8");

    const result = await migrateLegacyMemoryIfNeeded();

    expect(result.migrated).toEqual(["MEMORY.md"]);
    expect(result.skipped.sort()).toEqual(["USER.md", "daily/2026-05-12.md"]);
    expect(readFileSync(path.join(getZoraMemoryDirPath(), "USER.md"), "utf8")).toBe(
      "Current user"
    );
    expect(readFileSync(path.join(getZoraMemoryDirPath(), "MEMORY.md"), "utf8")).toBe(
      "Legacy memory"
    );
    expect(readFileSync(path.join(getZoraDailyDirPath(), "2026-05-12.md"), "utf8")).toBe(
      "Current daily"
    );
  });

  it("appends daily logs under daily/ and loads recent history", async () => {
    const homeDir = createTempHome();
    vi.useFakeTimers();

    const {
      appendDailyLog,
      getZoraDailyDirPath,
      loadDailyLog,
      loadRecentLogs,
    } = await loadMemoryStore(homeDir);

    vi.setSystemTime(new Date("2026-04-23T08:15:00+08:00"));
    await appendDailyLog("- planned launch");

    vi.setSystemTime(new Date("2026-04-24T09:45:00+08:00"));
    await appendDailyLog("- reviewed feedback");

    await expect(loadDailyLog("2026-04-23")).resolves.toContain("### 08:15");
    await expect(loadDailyLog("2026-04-24")).resolves.toContain("### 09:45");
    await expect(loadRecentLogs(2)).resolves.toBe(
      "## 2026-04-23\n### 08:15\n- planned launch\n\n## 2026-04-24\n### 09:45\n- reviewed feedback"
    );
    await expect(loadRecentLogs(0)).resolves.toBeNull();
    expect(readdirSync(getZoraDailyDirPath()).sort()).toEqual([
      "2026-04-23.md",
      "2026-04-24.md",
    ]);
  });
});
