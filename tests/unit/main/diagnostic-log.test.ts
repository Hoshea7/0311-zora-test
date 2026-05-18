import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const tempHomes = new Set<string>();

function createTempHome() {
  const homeDir = mkdtempSync(path.join(tmpdir(), "zora-diagnostic-log-"));
  tempHomes.add(homeDir);
  return homeDir;
}

async function loadDiagnosticLogModule(homeDir: string) {
  vi.resetModules();

  vi.doMock("node:os", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:os")>();
    return {
      ...actual,
      homedir: () => homeDir,
    };
  });

  const module = await import("@/main/diagnostic-log");
  module.enableDiagnosticFileLogForTests();
  return module;
}

function getLocalDateKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

afterEach(() => {
  delete process.env.ZORA_HOME;
  vi.doUnmock("node:os");
  vi.resetModules();

  for (const homeDir of tempHomes) {
    rmSync(homeDir, { recursive: true, force: true });
  }
  tempHomes.clear();
});

describe("main diagnostic-log", () => {
  it("writes JSONL logs under ~/.zora/logs and mirrors errors", async () => {
    const homeDir = createTempHome();
    const { ZORA_LOGS_DIR, flushDiagnosticLogWrites, writeDiagnosticLog } =
      await loadDiagnosticLogModule(homeDir);

    writeDiagnosticLog({
      level: "info",
      kind: "agent",
      agentType: "productivity",
      phase: "runtime",
      event: "assistant",
      message: "收到回复",
      fields: { sessionId: "session-1", text: "hello" },
    });
    writeDiagnosticLog({
      level: "error",
      kind: "system",
      area: "workspace",
      component: "store",
      event: "persist:error",
      message: "写入失败",
      fields: { reason: "boom" },
    });

    await flushDiagnosticLogWrites();

    const dateKey = getLocalDateKey();
    const mainPath = path.join(ZORA_LOGS_DIR, `zora-${dateKey}.jsonl`);
    const errorPath = path.join(ZORA_LOGS_DIR, `zora-error-${dateKey}.jsonl`);

    expect(ZORA_LOGS_DIR).toBe(path.join(homeDir, ".zora", "logs"));
    expect(existsSync(mainPath)).toBe(true);
    expect(existsSync(errorPath)).toBe(true);

    const mainLines = readFileSync(mainPath, "utf8").trim().split("\n");
    const errorLines = readFileSync(errorPath, "utf8").trim().split("\n");
    expect(mainLines).toHaveLength(2);
    expect(errorLines).toHaveLength(1);

    expect(JSON.parse(mainLines[0] ?? "{}")).toEqual(
      expect.objectContaining({
        level: "info",
        kind: "agent",
        agentType: "productivity",
        phase: "runtime",
        event: "assistant",
      })
    );
    expect(JSON.parse(errorLines[0] ?? "{}")).toEqual(
      expect.objectContaining({
        level: "error",
        kind: "system",
        area: "workspace",
        component: "store",
      })
    );
  });

  it("writes logs under ZORA_HOME when configured", async () => {
    const homeDir = createTempHome();
    process.env.ZORA_HOME = "~/zora-dev-data";
    const { ZORA_LOGS_DIR, flushDiagnosticLogWrites, writeDiagnosticLog } =
      await loadDiagnosticLogModule(homeDir);

    writeDiagnosticLog({
      level: "info",
      kind: "system",
      area: "test",
      component: "diagnostic-log",
      event: "zora-home",
      message: "configured home",
    });

    await flushDiagnosticLogWrites();

    expect(ZORA_LOGS_DIR).toBe(path.join(homeDir, "zora-dev-data", "logs"));
    expect(
      existsSync(path.join(ZORA_LOGS_DIR, `zora-${getLocalDateKey()}.jsonl`))
    ).toBe(true);
  });

  it("redacts secrets and truncates long fields before writing", async () => {
    const homeDir = createTempHome();
    const { ZORA_LOGS_DIR, flushDiagnosticLogWrites, writeDiagnosticLog } =
      await loadDiagnosticLogModule(homeDir);

    writeDiagnosticLog({
      level: "info",
      kind: "agent",
      message: "detail",
      fields: {
        apiKey: "sk-12345678901234567890",
        command: "curl -H 'Authorization: Bearer abcdefghijklmnop' https://example.com?token=secret-value",
        text: "x".repeat(21_000),
      },
    });

    await flushDiagnosticLogWrites();

    const [fileName] = readFileSync(
      path.join(ZORA_LOGS_DIR, `zora-${getLocalDateKey()}.jsonl`),
      "utf8"
    ).trim().split("\n");
    const record = JSON.parse(fileName ?? "{}");

    expect(record.fields.apiKey).toBe("[REDACTED]");
    expect(record.fields.command).toContain("Bearer [REDACTED]");
    expect(record.fields.command).toContain("token=[REDACTED]");
    expect(record.fields.text).toContain("...(21000 chars)");
    expect(record.fields.text.length).toBeLessThan(20_100);
  });
});
