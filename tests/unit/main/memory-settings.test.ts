import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEFAULT_MEMORY_SETTINGS } from "@/shared/types/memory";

const tempHomes = new Set<string>();

function createTempHome() {
  const homeDir = mkdtempSync(path.join(tmpdir(), "zora-memory-settings-"));
  tempHomes.add(homeDir);
  return homeDir;
}

async function loadMemorySettingsModule(homeDir: string) {
  vi.resetModules();

  vi.doMock("node:os", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:os")>();
    return {
      ...actual,
      homedir: () => homeDir,
    };
  });

  return import("@/main/memory-settings");
}

afterEach(() => {
  vi.doUnmock("node:os");
  vi.resetModules();

  for (const homeDir of tempHomes) {
    rmSync(homeDir, { recursive: true, force: true });
  }
  tempHomes.clear();
});

describe("main memory-settings", () => {
  it("returns default settings when no file exists and before cache initialization", async () => {
    const { getMemorySettingsSync, loadMemorySettings } =
      await loadMemorySettingsModule(createTempHome());

    expect(getMemorySettingsSync()).toEqual(DEFAULT_MEMORY_SETTINGS);
    await expect(loadMemorySettings()).resolves.toEqual(DEFAULT_MEMORY_SETTINGS);
  });

  it("saves and loads batch-mode settings", async () => {
    const homeDir = createTempHome();
    const { getMemorySettingsSync, loadMemorySettings, saveMemorySettings } =
      await loadMemorySettingsModule(homeDir);

    await saveMemorySettings({
      mode: "batch",
      batchIdleMinutes: 60,
      memoryProviderId: "provider-1",
      memoryModelId: "claude-haiku",
    });

    await expect(loadMemorySettings()).resolves.toEqual({
      mode: "batch",
      batchIdleMinutes: 60,
      memoryProviderId: "provider-1",
      memoryModelId: "claude-haiku",
    });
    expect(getMemorySettingsSync()).toEqual({
      mode: "batch",
      batchIdleMinutes: 60,
      memoryProviderId: "provider-1",
      memoryModelId: "claude-haiku",
    });
    expect(
      JSON.parse(
        readFileSync(path.join(homeDir, ".zora", "memory-settings.json"), "utf8")
      )
    ).toEqual({
      mode: "batch",
      batchIdleMinutes: 60,
      memoryProviderId: "provider-1",
      memoryModelId: "claude-haiku",
    });
  });

  it("saves and loads manual-mode settings with no provider override", async () => {
    const { loadMemorySettings, saveMemorySettings } =
      await loadMemorySettingsModule(createTempHome());

    await saveMemorySettings({
      mode: "manual",
      batchIdleMinutes: 30,
      memoryProviderId: null,
      memoryModelId: null,
    });

    await expect(loadMemorySettings()).resolves.toEqual({
      mode: "manual",
      batchIdleMinutes: 30,
      memoryProviderId: null,
      memoryModelId: null,
    });
  });

  it("normalizes invalid persisted values back to safe defaults", async () => {
    const homeDir = createTempHome();
    const settingsPath = path.join(homeDir, ".zora");
    const filePath = path.join(settingsPath, "memory-settings.json");
    const { loadMemorySettings } = await loadMemorySettingsModule(homeDir);

    await import("node:fs/promises").then(({ mkdir }) => mkdir(settingsPath, { recursive: true }));
    writeFileSync(
      filePath,
      JSON.stringify({
        mode: "later",
        batchIdleMinutes: 7,
        memoryProviderId: "   ",
        memoryModelId: "should-reset",
      }),
      "utf8"
    );

    await expect(loadMemorySettings()).resolves.toEqual(DEFAULT_MEMORY_SETTINGS);
  });
});
