import {
  existsSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const tempHomes = new Set<string>();

function createTempHome() {
  const homeDir = mkdtempSync(path.join(tmpdir(), "zora-prompt-"));
  tempHomes.add(homeDir);
  return homeDir;
}

async function loadPromptModules(homeDir: string) {
  vi.resetModules();

  vi.doMock("node:os", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:os")>();
    return {
      ...actual,
      homedir: () => homeDir,
    };
  });

  const memoryStore = await import("@/main/memory-store");
  const promptBuilder = await import("@/main/prompt-builder");

  return { ...memoryStore, ...promptBuilder };
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

describe("main prompt-builder", () => {
  it("enters bootstrap mode when SOUL.md is missing", async () => {
    const { isBootstrapMode } = await loadPromptModules(createTempHome());

    await expect(isBootstrapMode()).resolves.toBe(true);
  });

  it("treats an existing empty SOUL.md file as bootstrapped", async () => {
    const homeDir = createTempHome();
    const { saveFile, isBootstrapMode } = await loadPromptModules(homeDir);

    await saveFile("SOUL.md", "");

    await expect(isBootstrapMode()).resolves.toBe(false);
  });

  it("exits bootstrap mode when SOUL.md has content", async () => {
    const homeDir = createTempHome();
    const { saveFile, isBootstrapMode } = await loadPromptModules(homeDir);

    await saveFile("SOUL.md", "I am awake.");

    await expect(isBootstrapMode()).resolves.toBe(false);
  });

  it("builds the bootstrap prompt with the target zora directory", async () => {
    const homeDir = createTempHome();
    const { buildZoraSystemPrompt, getZoraDirPath } = await loadPromptModules(homeDir);

    const prompt = await buildZoraSystemPrompt();

    expect(prompt.type).toBe("preset");
    expect(prompt.preset).toBe("claude_code");
    expect(prompt.append).toContain("## 唤醒模式");
    expect(prompt.append).toContain(`${getZoraDirPath()}/`);
  });

  it("assembles the normal system prompt from memory files and recent logs", async () => {
    const homeDir = createTempHome();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-23T09:15:00Z"));

    const {
      appendDailyLog,
      buildZoraSystemPrompt,
      getZoraDirPath,
      saveFile,
    } = await loadPromptModules(homeDir);

    await saveFile("SOUL.md", "Tell the truth.");
    await saveFile("IDENTITY.md", "Name: Zora");
    await saveFile("USER.md", "Name: Alex");
    await saveFile("MEMORY.md", "Project: Launch week");
    await appendDailyLog("- Discussed launch plan");

    const prompt = await buildZoraSystemPrompt();
    const append = prompt.append;

    expect(existsSync(getZoraDirPath())).toBe(true);
    expect(append).toContain("## Your Soul\nTell the truth.");
    expect(append).toContain("## Your Identity\nName: Zora");
    expect(append).toContain("## Your Human\nName: Alex");
    expect(append).toContain("## Your Long-Term Memory\nProject: Launch week");
    expect(append).toContain("## Recent Daily Logs");
    expect(append).toContain("## 2026-04-23");
    expect(append).toContain("## Your Skills");
    expect(append).toContain("Your skills are managed in ~/.zora/skills/.");
    expect(append).toContain("## Memory System");

    expect(append.indexOf("## Your Soul")).toBeLessThan(append.indexOf("## Your Identity"));
    expect(append.indexOf("## Your Identity")).toBeLessThan(append.indexOf("## Your Human"));
    expect(append.indexOf("## Your Human")).toBeLessThan(append.indexOf("## Your Skills"));
    expect(append.indexOf("## Your Skills")).toBeLessThan(
      append.indexOf("## Your Long-Term Memory")
    );
    expect(append.indexOf("## Your Long-Term Memory")).toBeLessThan(
      append.indexOf("## Recent Daily Logs")
    );
    expect(append.indexOf("## Recent Daily Logs")).toBeLessThan(
      append.indexOf("## Memory System")
    );
  });
});
