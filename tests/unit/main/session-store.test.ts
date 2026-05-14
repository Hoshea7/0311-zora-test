import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const tempHomes = new Set<string>();

function createTempHome() {
  const homeDir = mkdtempSync(path.join(tmpdir(), "zora-session-"));
  tempHomes.add(homeDir);
  return homeDir;
}

function getSessionsDir(homeDir: string, workspaceId = "default") {
  return path.join(homeDir, ".zora", "workspaces", workspaceId, "sessions");
}

function getJsonlPath(homeDir: string, sessionId: string, workspaceId = "default") {
  return path.join(getSessionsDir(homeDir, workspaceId), `${sessionId}.jsonl`);
}

async function loadSessionStoreModule(homeDir: string) {
  vi.resetModules();

  vi.doMock("node:os", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:os")>();
    return {
      ...actual,
      homedir: () => homeDir,
    };
  });

  return import("@/main/session-store");
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

describe("main session-store", () => {
  it("lists no sessions for a fresh workspace", async () => {
    const homeDir = createTempHome();
    const { listSessions } = await loadSessionStoreModule(homeDir);

    await expect(listSessions()).resolves.toEqual([]);
    expect(existsSync(getSessionsDir(homeDir))).toBe(true);
  });

  it("creates multiple sessions and returns them in newest-first order", async () => {
    const homeDir = createTempHome();
    vi.useFakeTimers();
    const {
      createSession,
      getSessionMeta,
      listSessions,
      renameSession,
      setSdkSessionId,
      clearSdkSessionId,
    } = await loadSessionStoreModule(homeDir);

    vi.setSystemTime(new Date("2026-04-23T09:00:00+08:00"));
    const first = await createSession("First session");

    vi.setSystemTime(new Date("2026-04-23T09:05:00+08:00"));
    const second = await createSession("Second session");

    await expect(listSessions()).resolves.toEqual([
      expect.objectContaining({ id: second.id, title: "Second session" }),
      expect.objectContaining({ id: first.id, title: "First session" }),
    ]);

    vi.setSystemTime(new Date("2026-04-23T09:10:00+08:00"));
    await renameSession(first.id, "Renamed session");
    await setSdkSessionId(first.id, "sdk-session-1");

    await expect(getSessionMeta(first.id)).resolves.toEqual(
      expect.objectContaining({
        id: first.id,
        title: "Renamed session",
        sdkSessionId: "sdk-session-1",
        createdAt: "2026-04-23T01:00:00.000Z",
        updatedAt: "2026-04-23T01:10:00.000Z",
      })
    );

    await clearSdkSessionId(first.id);
    const cleared = await getSessionMeta(first.id);
    expect(cleared).not.toBeNull();
    expect(cleared).not.toHaveProperty("sdkSessionId");
  });

  it("appends message records as JSONL and restores merged assistant turns with tool results", async () => {
    const homeDir = createTempHome();
    const { appendMessageRecord, createSession, loadMessages } =
      await loadSessionStoreModule(homeDir);

    const session = await createSession("Chat session");

    await appendMessageRecord(session.id, {
      kind: "user",
      message: {
        id: "user-1",
        role: "user",
        text: "Please update the file.",
        timestamp: 1,
      },
    });

    await appendMessageRecord(session.id, {
      kind: "assistant_turn",
      turn: {
        id: "turn-1",
        processSteps: [
          {
            type: "tool",
            tool: {
              id: "tool-1",
              name: "Write",
              input: "{\"file_path\":\"/tmp/demo.txt\"}",
              status: "running",
              startedAt: 2,
            },
          },
        ],
        bodySegments: [
          {
            id: "segment-1",
            text: "Updating it now.",
          },
        ],
        status: "done",
        startedAt: 2,
        completedAt: 2,
      },
    });

    await appendMessageRecord(session.id, {
      kind: "tool_result",
      toolUseId: "tool-1",
      result: "Write completed",
      isError: false,
      completedAt: 3,
    });

    await appendMessageRecord(session.id, {
      kind: "assistant_turn",
      turn: {
        id: "turn-2",
        processSteps: [],
        bodySegments: [
          {
            id: "segment-2",
            text: "Finished.",
          },
        ],
        status: "done",
        startedAt: 4,
        completedAt: 4,
      },
    });

    const jsonlPath = getJsonlPath(homeDir, session.id);
    const jsonlLines = readFileSync(jsonlPath, "utf8").trim().split("\n");
    expect(jsonlLines).toHaveLength(4);
    expect(jsonlLines.every((line) => typeof JSON.parse(line) === "object")).toBe(true);

    await expect(loadMessages(session.id)).resolves.toEqual([
      {
        id: "user-1",
        role: "user",
        text: "Please update the file.",
        timestamp: 1,
      },
      {
        id: "turn-1",
        role: "assistant",
        timestamp: 2,
        turn: {
          id: "turn-1",
          processSteps: [
            {
              type: "tool",
              tool: {
                id: "tool-1",
                name: "Write",
                input: "{\"file_path\":\"/tmp/demo.txt\"}",
                result: "Write completed",
                status: "done",
                startedAt: 2,
                completedAt: 3,
              },
            },
          ],
          bodySegments: [
            {
              id: "segment-1",
              text: "Updating it now.",
            },
            {
              id: "segment-2",
              text: "Finished.",
            },
          ],
          status: "done",
          startedAt: 2,
          completedAt: 4,
        },
      },
    ]);
  });

  it("returns an empty array for missing transcripts", async () => {
    const { loadMessages } = await loadSessionStoreModule(createTempHome());

    await expect(loadMessages("missing-session")).resolves.toEqual([]);
  });

  it("loads large transcripts with 100+ messages in order", async () => {
    const homeDir = createTempHome();
    const { appendMessageRecord, createSession, loadMessages } =
      await loadSessionStoreModule(homeDir);

    const session = await createSession("Large transcript");

    for (let index = 0; index < 120; index += 1) {
      await appendMessageRecord(session.id, {
        kind: "user",
        message: {
          id: `user-${index}`,
          role: "user",
          text: `Message ${index}`,
          timestamp: index,
        },
      });
    }

    const messages = await loadMessages(session.id);

    expect(messages).toHaveLength(120);
    expect(messages[0]).toEqual(
      expect.objectContaining({
        id: "user-0",
        text: "Message 0",
      })
    );
    expect(messages.at(-1)).toEqual(
      expect.objectContaining({
        id: "user-119",
        text: "Message 119",
      })
    );
  }, 30_000);

  it("creates forked sessions with copied transcript and attachments", async () => {
    const homeDir = createTempHome();
    const {
      appendMessageRecord,
      createForkedSession,
      createSession,
      listSessions,
      loadMessages,
      saveAttachments,
      updateSessionMeta,
    } = await loadSessionStoreModule(homeDir);

    const source = await createSession("Source session");
    await updateSessionMeta(source.id, {
      providerId: "parent-provider",
      providerLocked: true,
      selectedModelId: "parent-model",
    });

    const savedAttachments = await saveAttachments(source.id, [
      {
        id: "attachment-1",
        name: "note.png",
        category: "image",
        mimeType: "image/png",
        size: 5,
        localPath: "",
        base64Data: Buffer.from("hello").toString("base64"),
      },
    ]);
    await appendMessageRecord(source.id, {
      kind: "user",
      message: {
        id: "user-with-attachment",
        role: "user",
        text: "Please inspect this.",
        timestamp: 1,
        attachments: savedAttachments,
      },
    });

    const fork = await createForkedSession({
      sourceSessionId: source.id,
      sourceSdkSessionId: "sdk-source",
      sdkSessionId: "sdk-fork",
      title: "Source session 的分支",
    });

    expect(fork).toEqual(
      expect.objectContaining({
        title: "Source session 的分支",
        sdkSessionId: "sdk-fork",
        providerLocked: false,
        branch: expect.objectContaining({
          sourceSessionId: source.id,
          sourceSdkSessionId: "sdk-source",
          forkMode: "full",
          inheritedMessageCount: 1,
        }),
      })
    );
    expect(fork).not.toHaveProperty("providerId");
    expect(fork).not.toHaveProperty("selectedModelId");

    const sessions = await listSessions();
    expect(sessions[0]).toEqual(expect.objectContaining({ id: fork.id }));

    const messages = await loadMessages(fork.id);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(
      expect.objectContaining({
        id: "user-with-attachment",
        role: "user",
        text: "Please inspect this.",
      })
    );
    expect(messages[0].attachments?.[0]).toEqual(
      expect.objectContaining({
        id: "attachment-1",
        name: "note.png",
        localPath: expect.stringContaining(fork.id),
        base64Data: Buffer.from("hello").toString("base64"),
      })
    );
    expect(existsSync(messages[0].attachments?.[0]?.localPath ?? "")).toBe(true);
  });

  it("rejects fork creation when the source session is missing", async () => {
    const { createForkedSession } = await loadSessionStoreModule(createTempHome());

    await expect(
      createForkedSession({
        sourceSessionId: "missing",
        sourceSdkSessionId: "sdk-source",
        sdkSessionId: "sdk-fork",
      })
    ).rejects.toThrow("Source session missing not found.");
  });

  it("deletes session metadata and transcript files cleanly", async () => {
    const homeDir = createTempHome();
    const { appendMessageRecord, createSession, deleteSession, listSessions, loadMessages } =
      await loadSessionStoreModule(homeDir);

    const session = await createSession("Delete me");
    await appendMessageRecord(session.id, {
      kind: "user",
      message: {
        id: "user-delete",
        role: "user",
        text: "bye",
        timestamp: 1,
      },
    });

    const jsonlPath = getJsonlPath(homeDir, session.id);
    expect(existsSync(jsonlPath)).toBe(true);

    await deleteSession(session.id);

    await expect(listSessions()).resolves.toEqual([]);
    await expect(loadMessages(session.id)).resolves.toEqual([]);
    expect(existsSync(jsonlPath)).toBe(false);
  });
});
