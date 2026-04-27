import {
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentStreamEvent, ConversationMessage } from "@/shared/zora";
import { MOCK_EVENTS, createMockSdkSession } from "../helpers/mock-sdk";

const hitlModuleId = path.resolve(process.cwd(), "src/main/hitl.ts");
const mcpManagerModuleId = path.resolve(process.cwd(), "src/main/mcp-manager.ts");
const memoryAgentModuleId = path.resolve(process.cwd(), "src/main/memory-agent.ts");
const sdkRuntimeModuleId = path.resolve(process.cwd(), "src/main/sdk-runtime.ts");
const tempHomes = new Set<string>();

function createTempHome() {
  const homeDir = mkdtempSync(path.join(tmpdir(), "zora-session-life-int-"));
  tempHomes.add(homeDir);
  return homeDir;
}

function createUserRecord(id: string, text: string, timestamp: number) {
  return {
    kind: "user" as const,
    message: {
      id,
      role: "user" as const,
      text,
      timestamp,
    },
  };
}

async function waitForMessages(
  loadMessages: (sessionId: string, workspaceId?: string) => Promise<ConversationMessage[]>,
  sessionId: string,
  expectedLength: number,
  workspaceId = "default",
  predicate?: (messages: ConversationMessage[]) => boolean
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const messages = await loadMessages(sessionId, workspaceId);
    if (messages.length === expectedLength && (!predicate || predicate(messages))) {
      return messages;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(
    `Timed out waiting for ${expectedLength} messages in session ${sessionId}.`
  );
}

function stripSdkSessionIds(events: SDKMessage[]) {
  return events.map((event) => {
    const cloned = structuredClone(event) as Record<string, unknown>;
    delete cloned.session_id;
    return cloned;
  });
}

const SESSION_LIFECYCLE_TOOL_EVENTS = stripSdkSessionIds([
  MOCK_EVENTS.withToolUse[0],
  MOCK_EVENTS.withToolUse[1],
  MOCK_EVENTS.withToolUse[2],
  MOCK_EVENTS.withToolUse[3],
  MOCK_EVENTS.withToolUse[5],
  MOCK_EVENTS.withToolUse[4],
  MOCK_EVENTS.withToolUse[6],
]);

async function loadSessionLifecycleRuntime(
  homeDir: string,
  events = SESSION_LIFECYCLE_TOOL_EVENTS
) {
  vi.resetModules();

  const query = vi.fn(() => createMockSdkSession(events));
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
    query,
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

  vi.doMock(sdkRuntimeModuleId, () => ({
    getSDKRuntimeOptions: () => ({
      executable: "node",
      executableArgs: [],
      pathToClaudeCodeExecutable: "/tmp/fake-sdk-cli",
      env: {},
    }),
    resolveSDKCliPath: () => "/tmp/fake-sdk-cli",
  }));

  return {
    productivityRunnerModule: await import("@/main/productivity-runner"),
    sessionStoreModule: await import("@/main/session-store"),
    mocks: {
      query,
      buildSdkMcpServers,
      createCanUseTool,
      clearAllPending,
      onConversationEnd,
      scheduleProcessing,
    },
  };
}

function createForwardEvent(sink: AgentStreamEvent[]) {
  return (payload: AgentStreamEvent) => {
    sink.push(payload);
  };
}

afterEach(() => {
  vi.doUnmock("node:os");
  vi.doUnmock("@anthropic-ai/claude-agent-sdk");
  vi.doUnmock(hitlModuleId);
  vi.doUnmock(mcpManagerModuleId);
  vi.doUnmock(memoryAgentModuleId);
  vi.doUnmock(sdkRuntimeModuleId);
  vi.resetModules();

  for (const homeDir of tempHomes) {
    rmSync(homeDir, { recursive: true, force: true });
  }
  tempHomes.clear();
});

describe("integration session lifecycle", () => {
  it("creates a session, persists messages through the productivity runner, and restores them in order", async () => {
    const homeDir = createTempHome();
    const { productivityRunnerModule, sessionStoreModule, mocks } =
      await loadSessionLifecycleRuntime(homeDir);

    const session = await sessionStoreModule.createSession("Launch planning");
    await sessionStoreModule.appendMessageRecord(
      session.id,
      createUserRecord("user-1", "帮我更新这个文件。", 1)
    );

    const events: AgentStreamEvent[] = [];
    await productivityRunnerModule.runProductivitySession({
      sessionId: session.id,
      text: "帮我更新这个文件。",
      forwardEvent: createForwardEvent(events),
      workspaceId: "default",
    });

    const assistantEvent = events.find(
      (event) => event.type === "assistant" && "message" in (event as Record<string, unknown>)
    ) as (AgentStreamEvent & { message: unknown }) | undefined;
    const toolResultEvent = events.find(
      (event) => event.type === "user" && "message" in (event as Record<string, unknown>)
    ) as (AgentStreamEvent & { message: unknown }) | undefined;

    expect(assistantEvent).toBeDefined();
    expect(toolResultEvent).toBeDefined();

    sessionStoreModule.persistAssistantMessage(session.id, assistantEvent?.message, "default");
    await waitForMessages(sessionStoreModule.loadMessages, session.id, 2);

    sessionStoreModule.persistToolResults(session.id, toolResultEvent?.message, "default");
    await waitForMessages(
      sessionStoreModule.loadMessages,
      session.id,
      2,
      "default",
      (currentMessages) =>
        currentMessages[1]?.role === "assistant" &&
        currentMessages[1].turn?.processSteps[0]?.type === "tool" &&
        currentMessages[1].turn.processSteps[0].tool.status === "done"
    );

    await sessionStoreModule.appendMessageRecord(
      session.id,
      createUserRecord("user-2", "顺便告诉我你改了什么。", 5)
    );

    const messages = await waitForMessages(sessionStoreModule.loadMessages, session.id, 3);

    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.buildSdkMcpServers).toHaveBeenCalledTimes(1);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "agent_status", status: "started" }),
        expect.objectContaining({ type: "assistant" }),
        expect.objectContaining({ type: "user" }),
        expect.objectContaining({ type: "agent_status", status: "finished" }),
      ])
    );
    expect(messages).toEqual([
      {
        id: "user-1",
        role: "user",
        text: "帮我更新这个文件。",
        timestamp: 1,
      },
      {
        id: expect.any(String),
        role: "assistant",
        timestamp: expect.any(Number),
        turn: {
          id: expect.any(String),
          processSteps: [
            {
              type: "tool",
              tool: expect.objectContaining({
                id: "tool-write-1",
                name: "Write",
                status: "done",
                result: "Write completed",
              }),
            },
          ],
          bodySegments: [
            { id: expect.any(String), text: "I will update that file." },
            { id: expect.any(String), text: "Finished." },
          ],
          status: "done",
          startedAt: expect.any(Number),
          completedAt: expect.any(Number),
        },
      },
      {
        id: "user-2",
        role: "user",
        text: "顺便告诉我你改了什么。",
        timestamp: 5,
      },
    ]);
  });

  it("restores the transcript after a module reload", async () => {
    const homeDir = createTempHome();
    const firstLoad = await loadSessionLifecycleRuntime(
      homeDir,
      stripSdkSessionIds(MOCK_EVENTS.simpleTextReply)
    );

    const session = await firstLoad.sessionStoreModule.createSession("Reloadable session");
    await firstLoad.sessionStoreModule.appendMessageRecord(
      session.id,
      createUserRecord("user-1", "今天有什么进展？", 1)
    );

    const events: AgentStreamEvent[] = [];
    await firstLoad.productivityRunnerModule.runProductivitySession({
      sessionId: session.id,
      text: "今天有什么进展？",
      forwardEvent: createForwardEvent(events),
      workspaceId: "default",
    });

    const assistantEvent = events.find(
      (event) => event.type === "assistant" && "message" in (event as Record<string, unknown>)
    ) as (AgentStreamEvent & { message: unknown }) | undefined;

    expect(assistantEvent).toBeDefined();

    firstLoad.sessionStoreModule.persistAssistantMessage(
      session.id,
      assistantEvent?.message,
      "default"
    );

    const expected = await waitForMessages(
      firstLoad.sessionStoreModule.loadMessages,
      session.id,
      2
    );

    const secondLoad = await loadSessionLifecycleRuntime(homeDir);
    await expect(secondLoad.sessionStoreModule.loadMessages(session.id)).resolves.toEqual(expected);
  });

  it("keeps multiple sessions isolated from each other", async () => {
    const homeDir = createTempHome();
    const { sessionStoreModule } = await loadSessionLifecycleRuntime(homeDir);

    const sessionA = await sessionStoreModule.createSession("Session A");
    const sessionB = await sessionStoreModule.createSession("Session B");

    await sessionStoreModule.appendMessageRecord(
      sessionA.id,
      createUserRecord("user-a", "A message", 1)
    );
    await sessionStoreModule.appendMessageRecord(
      sessionB.id,
      createUserRecord("user-b", "B message", 2)
    );

    await expect(sessionStoreModule.loadMessages(sessionA.id)).resolves.toEqual([
      {
        id: "user-a",
        role: "user",
        text: "A message",
        timestamp: 1,
      },
    ]);
    await expect(sessionStoreModule.loadMessages(sessionB.id)).resolves.toEqual([
      {
        id: "user-b",
        role: "user",
        text: "B message",
        timestamp: 2,
      },
    ]);
  });

  it("returns an empty transcript for a session without messages", async () => {
    const homeDir = createTempHome();
    const { sessionStoreModule } = await loadSessionLifecycleRuntime(homeDir);

    const session = await sessionStoreModule.createSession("Quiet session");

    await expect(sessionStoreModule.loadMessages(session.id)).resolves.toEqual([]);
  });

  it("persists session title updates across reloads", async () => {
    const homeDir = createTempHome();
    const firstLoad = await loadSessionLifecycleRuntime(homeDir);

    const session = await firstLoad.sessionStoreModule.createSession("Original title");
    await firstLoad.sessionStoreModule.renameSession(session.id, "Updated title");

    const secondLoad = await loadSessionLifecycleRuntime(homeDir);
    await expect(secondLoad.sessionStoreModule.getSessionMeta(session.id)).resolves.toEqual(
      expect.objectContaining({
        id: session.id,
        title: "Updated title",
      })
    );
  });
});
