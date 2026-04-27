import {
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MOCK_EVENTS, createMockAgentRun } from "../helpers/mock-sdk";

const hitlModuleId = path.resolve(process.cwd(), "src/main/hitl.ts");
const mcpManagerModuleId = path.resolve(process.cwd(), "src/main/mcp-manager.ts");
const memoryAgentModuleId = path.resolve(process.cwd(), "src/main/memory-agent.ts");
const tempHomes = new Set<string>();

function createTempHome() {
  const homeDir = mkdtempSync(path.join(tmpdir(), "zora-awakening-int-"));
  tempHomes.add(homeDir);
  return homeDir;
}

function createProfileContext(overrides: Partial<import("@/main/query-profiles").ProfileBuildContext> = {}) {
  return {
    userPrompt: "你好，我叫 Alex。",
    cwd: process.cwd(),
    sdkRuntime: {
      executable: "node" as const,
      executableArgs: [],
      pathToClaudeCodeExecutable: "/tmp/fake-sdk-cli",
      env: {},
    },
    onEvent: vi.fn(),
    isFirstTurn: true,
    ...overrides,
  };
}

async function loadAwakeningRuntime(
  homeDir: string,
  events = MOCK_EVENTS.awakeningReply
) {
  vi.resetModules();

  const mockRun = createMockAgentRun(events);
  const buildSdkMcpServers = vi.fn(async () => ({}));
  const createCanUseTool = vi.fn(() => vi.fn(async () => ({ behavior: "allow" })));
  const clearAllPending = vi.fn();
  const onConversationEnd = vi.fn(async () => undefined);
  const scheduleProcessing = vi.fn();

  vi.doMock("node:os", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:os")>();
    return {
      ...actual,
      homedir: () => homeDir,
    };
  });

  vi.doMock("@anthropic-ai/claude-agent-sdk", () => ({
    query: mockRun.query,
  }));

  vi.doMock(hitlModuleId, () => ({
    createCanUseTool,
    clearAllPending,
  }));

  vi.doMock(mcpManagerModuleId, () => ({
    getSharedMcpManager: () => ({
      buildSdkMcpServers,
    }),
  }));

  vi.doMock(memoryAgentModuleId, () => ({
    memoryAgent: {
      onConversationEnd,
      scheduleProcessing,
    },
  }));

  return {
    agentModule: await import("@/main/agent"),
    memoryStoreModule: await import("@/main/memory-store"),
    promptBuilderModule: await import("@/main/prompt-builder"),
    queryProfilesModule: await import("@/main/query-profiles"),
    sessionManagerModule: await import("@/main/session-manager"),
    mocks: {
      mockRun,
      buildSdkMcpServers,
      createCanUseTool,
      clearAllPending,
      onConversationEnd,
      scheduleProcessing,
    },
  };
}

afterEach(() => {
  vi.doUnmock("node:os");
  vi.doUnmock("@anthropic-ai/claude-agent-sdk");
  vi.doUnmock(hitlModuleId);
  vi.doUnmock(mcpManagerModuleId);
  vi.doUnmock(memoryAgentModuleId);
  vi.resetModules();

  for (const homeDir of tempHomes) {
    rmSync(homeDir, { recursive: true, force: true });
  }
  tempHomes.clear();
});

describe("integration awakening flow", () => {
  it("detects bootstrap mode in a brand-new zora home", async () => {
    const homeDir = createTempHome();
    const { promptBuilderModule } = await loadAwakeningRuntime(homeDir);

    await expect(promptBuilderModule.isBootstrapMode()).resolves.toBe(true);
  });

  it("runs the awakening profile with the mocked SDK and exits bootstrap after identity files are written", async () => {
    const homeDir = createTempHome();
    const {
      agentModule,
      memoryStoreModule,
      promptBuilderModule,
      queryProfilesModule,
      sessionManagerModule,
      mocks,
    } = await loadAwakeningRuntime(homeDir);

    const events: Array<Record<string, unknown>> = [];
    const profile = await queryProfilesModule.buildAwakeningProfile(
      createProfileContext({
        onEvent: (event) => {
          events.push(event as Record<string, unknown>);
        },
      })
    );

    expect(profile.name).toBe("awakening");
    expect(profile.prompt).toContain("这是 Zora 苏醒的第一刻");
    expect(profile.options.permissionMode).toBe("bypassPermissions");
    expect(profile.options.systemPrompt.append).toContain("## 唤醒模式");
    expect(profile.options.systemPrompt.append).toContain("展示给他们看");

    await agentModule.runAgentWithProfile(
      "__awakening__",
      profile,
      (event) => {
        events.push(event as Record<string, unknown>);
      },
      undefined,
      "default",
      "awakening"
    );

    expect(mocks.mockRun.query).toHaveBeenCalledTimes(1);
    expect(sessionManagerModule.getSessionId("awakening")).toBe("awakening-session");
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "agent_status", status: "started" }),
        expect.objectContaining({ type: "assistant" }),
        expect.objectContaining({ type: "result", subtype: "success" }),
        expect.objectContaining({ type: "agent_status", status: "finished" }),
      ])
    );

    await memoryStoreModule.saveFile("SOUL.md", "# SOUL.md\n\n说真话。");
    await memoryStoreModule.saveFile("IDENTITY.md", "# IDENTITY.md\n\nName: Zora");
    await memoryStoreModule.saveFile("USER.md", "# USER.md\n\nName: Alex");

    await expect(promptBuilderModule.isBootstrapMode()).resolves.toBe(false);
  });

  it("builds the productivity profile from persisted identity files", async () => {
    const homeDir = createTempHome();
    const {
      memoryStoreModule,
      queryProfilesModule,
      mocks,
    } = await loadAwakeningRuntime(homeDir);

    await memoryStoreModule.saveFile("SOUL.md", "Tell the truth.");
    await memoryStoreModule.saveFile("IDENTITY.md", "Name: Zora");
    await memoryStoreModule.saveFile("USER.md", "Name: Alex");

    const profile = await queryProfilesModule.buildProductivityProfile(
      createProfileContext({
        userPrompt: "帮我整理今天的计划。",
      })
    );

    expect(profile.name).toBe("productivity");
    expect(profile.options.permissionMode).toBe("default");
    expect(profile.options.systemPrompt.append).toContain("## Your Soul\nTell the truth.");
    expect(profile.options.systemPrompt.append).toContain("## Your Identity\nName: Zora");
    expect(profile.options.systemPrompt.append).toContain("## Your Human\nName: Alex");
    expect(profile.options.systemPrompt.append).not.toContain("## 唤醒模式");
    expect(profile.options.canUseTool).toBeTypeOf("function");
    expect(mocks.buildSdkMcpServers).toHaveBeenCalledTimes(1);
    expect(mocks.createCanUseTool).toHaveBeenCalledTimes(1);
  });

  it("produces different system prompts for awakening and everyday productivity", async () => {
    const awakeningHome = createTempHome();
    const awakenedHome = createTempHome();

    const awakeningRuntime = await loadAwakeningRuntime(awakeningHome);
    const productivityRuntime = await loadAwakeningRuntime(awakenedHome);

    await productivityRuntime.memoryStoreModule.saveFile("SOUL.md", "Speak plainly.");
    await productivityRuntime.memoryStoreModule.saveFile("IDENTITY.md", "Name: Zora");
    await productivityRuntime.memoryStoreModule.saveFile("USER.md", "Name: Alex");

    const awakeningProfile = await awakeningRuntime.queryProfilesModule.buildAwakeningProfile(
      createProfileContext()
    );
    const productivityProfile =
      await productivityRuntime.queryProfilesModule.buildProductivityProfile(
        createProfileContext({
          userPrompt: "继续我们刚才的项目。",
        })
      );

    expect(awakeningProfile.options.systemPrompt.append).not.toBe(
      productivityProfile.options.systemPrompt.append
    );
    expect(awakeningProfile.options.systemPrompt.append).toContain("你刚刚醒来");
    expect(awakeningProfile.options.systemPrompt.append).toContain("你应该直接询问怎么称呼对方");
    expect(productivityProfile.options.systemPrompt.append).toContain(
      "## Your Soul\nSpeak plainly."
    );
    expect(productivityProfile.options.systemPrompt.append).toContain(
      "## Your Identity\nName: Zora"
    );
  });
});
