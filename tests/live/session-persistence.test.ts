import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { describeLive } from "./helpers/skip-guard";
import { sendLiveQuery } from "./helpers/sdk-harness";
import { createTestZoraHome } from "./helpers/test-zora-home";
import { createCaseReporter } from "./helpers/step-reporter";

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

function createAssistantTurnRecord(id: string, text: string, timestamp: number) {
  return {
    kind: "assistant_turn" as const,
    turn: {
      id,
      processSteps: [],
      bodySegments: [
        {
          id: `${id}-segment`,
          text,
        },
      ],
      status: "done" as const,
      startedAt: timestamp,
      completedAt: timestamp,
    },
  };
}

async function withTestHome<T>(
  homeDir: string,
  run: () => Promise<T>
): Promise<T> {
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;

  process.env.HOME = homeDir;
  process.env.USERPROFILE = homeDir;
  vi.resetModules();

  try {
    return await run();
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }

    if (previousUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = previousUserProfile;
    }

    vi.resetModules();
  }
}

describeLive("Session Persistence", (provider) => {
  const providerDesc = `${provider.name} (${provider.model || "default"})`;

  it("should persist a live SDK reply to session-store JSONL and restore it", async () => {
    const reporter = createCaseReporter(
      "L3-SESS-001a",
      "Session 持久化-单轮恢复",
      providerDesc
    );
    const testHome = createTestZoraHome();

    try {
      const userMessage = "What is 2 + 3? Reply with just the number.";
      let responseText = "";

      await reporter.step("发起真实单轮对话", "通过 SDK 获取 2+3 的回答", async () => {
        const result = await sendLiveQuery(provider, userMessage, {
          maxTurns: 1,
        });

        reporter.setInput(userMessage);
        reporter.setOutput(`回复: "${result.text.slice(0, 100)}"`);

        expect(result.success).toBe(true);
        expect(result.text.length).toBeGreaterThan(0);
        responseText = result.text;
      });

      await reporter.step("写入并恢复 session-store", "使用真实 session-store 追加并回读 JSONL", async () => {
        await withTestHome(testHome.homeDir, async () => {
          const sessionStore = await import("@/main/session-store");

          const session = await sessionStore.createSession("Live persistence");
          await sessionStore.appendMessageRecord(
            session.id,
            createUserRecord("user-1", userMessage, 1)
          );
          await sessionStore.appendMessageRecord(
            session.id,
            createAssistantTurnRecord("turn-1", responseText, 2)
          );

          const sessions = await sessionStore.listSessions();
          const restored = await sessionStore.loadMessages(session.id);
          const jsonlPath = join(testHome.sessionsDir, `${session.id}.jsonl`);
          const lines = readFileSync(jsonlPath, "utf8").trim().split("\n");

          reporter.setInput(`sessionId=${session.id}`);
          reporter.setOutput(`sessions=${sessions.length}, messages=${restored.length}, jsonlLines=${lines.length}`);

          expect(sessions).toHaveLength(1);
          expect(restored).toHaveLength(2);
          expect(restored[0]?.role).toBe("user");
          expect(restored[0]?.text).toBe(userMessage);
          expect(restored[1]?.role).toBe("assistant");
          expect(restored[1]?.turn?.bodySegments[0]?.text).toBe(responseText);
          expect(lines).toHaveLength(2);
        });
      });
    } finally {
      reporter.done();
      testHome.cleanup();
    }
  });

  it("should preserve multi-turn order across reload", async () => {
    const reporter = createCaseReporter(
      "L3-SESS-001b",
      "Session 持久化-多轮顺序恢复",
      providerDesc
    );
    const testHome = createTestZoraHome();

    try {
      const firstPrompt = "Remember this number: 42. Just confirm you noted it.";
      const secondPrompt =
        "What number did I just tell you? If you don't know, just say you don't know.";
      let firstResponse = "";
      let secondResponse = "";

      await reporter.step("生成两轮真实对话", "分别发送记住数字和追问数字", async () => {
        const firstResult = await sendLiveQuery(provider, firstPrompt, {
          maxTurns: 1,
        });
        const secondResult = await sendLiveQuery(provider, secondPrompt, {
          maxTurns: 1,
        });

        reporter.setInput("turn1=remember 42, turn2=what number?");
        reporter.setOutput(
          `turn1="${firstResult.text.slice(0, 60)}" | turn2="${secondResult.text.slice(0, 60)}"`
        );

        expect(firstResult.success).toBe(true);
        expect(secondResult.success).toBe(true);
        firstResponse = firstResult.text;
        secondResponse = secondResult.text;
      });

      await reporter.step("落盘并按顺序恢复", "使用真实 session-store 保存 4 条消息并回读", async () => {
        await withTestHome(testHome.homeDir, async () => {
          const sessionStore = await import("@/main/session-store");

          const session = await sessionStore.createSession("Live multi-turn persistence");
          await sessionStore.appendMessageRecord(
            session.id,
            createUserRecord("user-1", firstPrompt, 1)
          );
          await sessionStore.appendMessageRecord(
            session.id,
            createAssistantTurnRecord("turn-1", firstResponse, 2)
          );
          await sessionStore.appendMessageRecord(
            session.id,
            createUserRecord("user-2", secondPrompt, 3)
          );
          await sessionStore.appendMessageRecord(
            session.id,
            createAssistantTurnRecord("turn-2", secondResponse, 4)
          );

          const restored = await sessionStore.loadMessages(session.id);
          reporter.setInput(`sessionId=${session.id}`);
          reporter.setOutput(`roles=${restored.map((message) => message.role).join(" -> ")}`);

          expect(restored).toHaveLength(4);
          expect(restored.map((message) => message.role)).toEqual([
            "user",
            "assistant",
            "user",
            "assistant",
          ]);
          expect(restored[1]?.turn?.bodySegments[0]?.text.length ?? 0).toBeGreaterThan(0);
          expect(restored[3]?.turn?.bodySegments[0]?.text.length ?? 0).toBeGreaterThan(0);
        });
      });
    } finally {
      reporter.done();
      testHome.cleanup();
    }
  });
});
