import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const tempHomes = new Set<string>();

function createTempHome() {
  const homeDir = mkdtempSync(path.join(tmpdir(), "zora-dynamic-context-"));
  tempHomes.add(homeDir);
  return homeDir;
}

async function loadModules(homeDir: string) {
  vi.resetModules();

  vi.doMock("node:os", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:os")>();
    return {
      ...actual,
      homedir: () => homeDir,
    };
  });

  return {
    memoryStore: await import("@/main/memory-store"),
    dynamicContext: await import("@/main/prompts/zora-dynamic-context"),
  };
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

describe("zora dynamic context", () => {
  it("includes hourly local time and timezone", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 24, 9, 45, 33));
    const { dynamicContext } = await loadModules(createTempHome());

    const context = await dynamicContext.buildZoraDynamicContext();

    expect(context).toContain("<zora_dynamic_context>");
    expect(context).toContain(
      '<local_time granularity="hour">2026-04-24 09:00</local_time>'
    );
    expect(context).toMatch(/<timezone>[^<]+<\/timezone>/);
  });

  it("reads USER.md, MEMORY.md, and recent daily logs", async () => {
    vi.useFakeTimers();
    const { dynamicContext, memoryStore } = await loadModules(createTempHome());

    await memoryStore.saveFile("USER.md", "# USER.md\n\n称呼：天");
    await memoryStore.saveFile("MEMORY.md", "# MEMORY.md\n\n## Core Facts\n- 正在重构 Zora 记忆系统");

    vi.setSystemTime(new Date(2026, 3, 23, 18, 10));
    await memoryStore.appendDailyLog("- 讨论 memory path");
    vi.setSystemTime(new Date(2026, 3, 24, 9, 45));
    await memoryStore.appendDailyLog("- 接入 dynamic context");

    const context = await dynamicContext.buildZoraDynamicContext();

    expect(context).toContain('<file name="USER.md">');
    expect(context).toContain("称呼：天");
    expect(context).toContain('<file name="MEMORY.md">');
    expect(context).toContain("正在重构 Zora 记忆系统");
    expect(context).toContain("<recent_daily_logs>");
    expect(context).toContain("## 2026-04-23");
    expect(context).toContain("## 2026-04-24");
  });

  it("migrates legacy memory before building dynamic context", async () => {
    const { dynamicContext, memoryStore } = await loadModules(createTempHome());

    mkdirSync(memoryStore.getLegacyZoraDirPath(), { recursive: true });
    writeFileSync(
      path.join(memoryStore.getLegacyZoraDirPath(), "USER.md"),
      "# USER.md\n\n称呼：旧用户",
      "utf8"
    );

    const context = await dynamicContext.buildZoraDynamicContext();

    expect(context).toContain("称呼：旧用户");
    expect(existsSync(path.join(memoryStore.getZoraMemoryDirPath(), "USER.md"))).toBe(true);
    expect(readFileSync(path.join(memoryStore.getZoraMemoryDirPath(), "USER.md"), "utf8")).toContain(
      "称呼：旧用户"
    );
  });

  it("uses an empty-memory message when no memory files exist", async () => {
    const { dynamicContext } = await loadModules(createTempHome());

    const context = await dynamicContext.buildZoraDynamicContext();

    expect(context).toContain("当前没有注入的长期记忆。");
  });

  it("wraps raw prompts without a user_message tag", async () => {
    const { dynamicContext } = await loadModules(createTempHome());

    const prompt = await dynamicContext.buildZoraPrompt(
      "你好",
      "default",
      "/tmp/zora-session"
    );

    expect(prompt).toContain("<zora_dynamic_context>");
    expect(prompt).toContain("<current_workspace_id>default</current_workspace_id>");
    expect(prompt).toContain(
      "<current_working_directory>/tmp/zora-session</current_working_directory>"
    );
    expect(prompt).not.toContain("<user_message>");
    expect(prompt.endsWith("\n\n你好")).toBe(true);
  });
});
