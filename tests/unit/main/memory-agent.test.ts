import type { ConversationMessage } from "@/shared/zora";
import path from "node:path";

const agentModuleId = path.resolve(process.cwd(), "src/main/agent.ts");
const memorySettingsModuleId = path.resolve(process.cwd(), "src/main/memory-settings.ts");
const memoryStoreModuleId = path.resolve(process.cwd(), "src/main/memory-store.ts");
const queryProfilesModuleId = path.resolve(process.cwd(), "src/main/query-profiles/index.ts");
const sdkRuntimeModuleId = path.resolve(process.cwd(), "src/main/sdk-runtime.ts");
const sessionStoreModuleId = path.resolve(process.cwd(), "src/main/session-store.ts");

function createMessages(label: string): ConversationMessage[] {
  return [
    {
      id: `${label}-user-1`,
      role: "user",
      text: `${label} user asks`,
      timestamp: 1,
    },
    {
      id: `${label}-assistant-1`,
      role: "assistant",
      timestamp: 2,
      turn: {
        id: `${label}-turn-1`,
        processSteps: [],
        bodySegments: [{ id: `${label}-body-1`, text: `${label} reply` }],
        status: "done",
        startedAt: 2,
        completedAt: 3,
      },
    },
    {
      id: `${label}-user-2`,
      role: "user",
      text: `${label} user follows up`,
      timestamp: 4,
    },
    {
      id: `${label}-assistant-2`,
      role: "assistant",
      timestamp: 5,
      turn: {
        id: `${label}-turn-2`,
        processSteps: [],
        bodySegments: [{ id: `${label}-body-2`, text: `${label} second reply` }],
        status: "done",
        startedAt: 5,
        completedAt: 6,
      },
    },
  ];
}

async function loadMemoryAgentRuntime() {
  vi.resetModules();

  const runAgentWithProfile = vi.fn(async () => ({
    lateQueuedMessages: [],
    sdkSessionId: undefined,
  }));
  const loadMemorySettings = vi.fn(async () => ({
    mode: "batch",
    batchIdleMinutes: 30,
    memoryProviderId: null,
    memoryModelId: null,
  }));
  const getMemorySettingsSync = vi.fn(() => ({
    mode: "batch",
    batchIdleMinutes: 30,
    memoryProviderId: null,
    memoryModelId: null,
  }));
  const buildMemoryProfile = vi.fn(async ({ prompt }: { prompt: string }) => ({
    name: "memory",
    prompt,
    options: {
      cwd: "/tmp/zora-memory",
      maxTurns: 7,
    },
  }));
  const loadMessages = vi.fn(async (sessionId: string) => createMessages(sessionId));
  const listSessions = vi.fn(async (workspaceId = "default") => [
    {
      id: `${workspaceId}-session`,
      title: `${workspaceId} title`,
      createdAt: "2026-05-14T00:00:00.000Z",
      updatedAt: "2026-05-14T00:00:00.000Z",
    },
  ]);

  vi.doMock(agentModuleId, () => ({
    isAgentRunningForSession: vi.fn(() => false),
    runAgentWithProfile,
  }));
  vi.doMock(memorySettingsModuleId, () => ({
    getMemorySettingsSync,
    loadMemorySettings,
  }));
  vi.doMock(memoryStoreModuleId, () => ({
    getZoraMemoryDirPath: vi.fn(() => "/tmp/zora-memory"),
    loadFile: vi.fn(async (fileName: string) => `${fileName} current content`),
  }));
  vi.doMock(queryProfilesModuleId, () => ({
    buildMemoryProfile,
  }));
  vi.doMock(sdkRuntimeModuleId, () => ({
    getSDKRuntimeOptions: vi.fn(() => ({
      executable: "node",
      executableArgs: [],
      pathToClaudeCodeExecutable: "/tmp/fake-claude",
      env: {},
    })),
  }));
  vi.doMock(sessionStoreModuleId, () => ({
    listSessions,
    loadMessages,
  }));

  return {
    module: await import("@/main/memory-agent"),
    mocks: {
      buildMemoryProfile,
      listSessions,
      loadMessages,
      runAgentWithProfile,
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock(agentModuleId);
  vi.doUnmock(memorySettingsModuleId);
  vi.doUnmock(memoryStoreModuleId);
  vi.doUnmock(queryProfilesModuleId);
  vi.doUnmock(sdkRuntimeModuleId);
  vi.doUnmock(sessionStoreModuleId);
  vi.resetModules();
});

describe("main memory-agent", () => {
  it("keeps batch memory processing scoped to each workspace", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-14T09:30:00+08:00"));

    const {
      module: { MemoryAgent },
      mocks,
    } = await loadMemoryAgentRuntime();
    const agent = new MemoryAgent();

    await agent.onConversationEnd("workspace-a-session", "workspace-a");
    await agent.onConversationEnd("workspace-b-session", "workspace-b");
    const result = await agent.processNow();

    expect(result).toEqual({ total: 2, processed: 2 });
    expect(mocks.listSessions).toHaveBeenCalledWith("workspace-a");
    expect(mocks.listSessions).toHaveBeenCalledWith("workspace-b");
    expect(mocks.runAgentWithProfile).toHaveBeenCalledTimes(2);
    expect(mocks.runAgentWithProfile.mock.calls.map((call) => call[4])).toEqual([
      "workspace-a",
      "workspace-b",
    ]);
    expect(mocks.buildMemoryProfile.mock.calls.map((call) => call[0].prompt)).toEqual([
      expect.stringContaining("**Session**: workspace-a title"),
      expect.stringContaining("**Session**: workspace-b title"),
    ]);
  });
});
