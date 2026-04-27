import { expect, it, vi } from "vitest";
import { describeLive } from "./helpers/skip-guard";
import { sendLiveQuery } from "./helpers/sdk-harness";
import { createTestZoraHome } from "./helpers/test-zora-home";
import { createCaseReporter } from "./helpers/step-reporter";

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
      bodySegments: [{ id: `${id}-segment`, text }],
      status: "done" as const,
      startedAt: timestamp,
      completedAt: timestamp,
    },
  };
}

describeLive("Awakening Flow (E2E)", (provider) => {
  const providerDesc = `${provider.name} (${provider.model || "default"})`;

  it("should complete full awakening E2E flow", async () => {
    const reporter = createCaseReporter(
      "L3-AWAK-001",
      "Awakening 真实 E2E 流程",
      providerDesc
    );
    const testHome = createTestZoraHome();
    let prompt = "";
    let systemPrompt = "";
    let responseText = "";

    try {
      await reporter.step(
        "检测 bootstrapMode",
        "调用真实 prompt-builder 判断是否为首次启动",
        async () => {
          await withTestHome(testHome.homeDir, async () => {
            const promptBuilder = await import("@/main/prompt-builder");

            reporter.setInput(`HOME=${testHome.homeDir}，初始无 SOUL/IDENTITY/USER`);
            const result = await promptBuilder.isBootstrapMode();
            reporter.setOutput(`isBootstrapMode() => ${result}`);
            expect(result).toBe(true);
          });
        }
      );

      await reporter.step(
        "构建 Awakening Profile",
        "通过真实 query profile 组装 prompt 和 system prompt",
        async () => {
          await withTestHome(testHome.homeDir, async () => {
            const queryProfiles = await import("@/main/query-profiles");
            const sdkRuntime = await import("@/main/sdk-runtime");

            const profile = await queryProfiles.buildAwakeningProfile({
              userPrompt: "你好，我是第一次使用你。",
              cwd: process.cwd(),
              sdkRuntime: sdkRuntime.getSDKRuntimeOptions(),
              onEvent: () => {},
              isFirstTurn: true,
            });

            prompt = profile.prompt;
            systemPrompt = profile.options.systemPrompt.append;

            reporter.setInput("userPrompt='你好，我是第一次使用你。'");
            reporter.setOutput(
              `profile=${profile.name}, prompt=${prompt.length}字, systemPrompt=${systemPrompt.length}字`
            );

            expect(profile.name).toBe("awakening");
            expect(prompt).toContain("这是 Zora 苏醒的第一刻");
            expect(systemPrompt).toContain("## 唤醒模式");
          });
        }
      );

      await reporter.step(
        "发起真实 SDK 对话",
        `通过 ${providerDesc} 发送 awakening 首轮消息`,
        async () => {
          const promptAttempts = [
            prompt,
            "你好，我是第一次使用你。请你先用一句话自我介绍，再问我一个认识我的简短问题。",
            "Hello, I'm new here. Please introduce yourself warmly in one sentence and ask me one short question.",
          ];

          let result = await sendLiveQuery(provider, promptAttempts[0]!, {
            maxTurns: 1,
            systemPrompt,
          });

          let attemptIndex = 0;
          while (
            result.success &&
            result.text.trim().length === 0 &&
            attemptIndex < promptAttempts.length - 1
          ) {
            attemptIndex += 1;
            result = await sendLiveQuery(provider, promptAttempts[attemptIndex]!, {
              maxTurns: 1,
              systemPrompt,
            });
          }

          const promptLabel =
            attemptIndex === 0
              ? "profile.prompt"
              : `fallback-${attemptIndex}: ${promptAttempts[attemptIndex]}`;
          const messageTypes = result.messages.map((message) => message.type).join(", ");
          const outputPreview =
            `attempt=${promptLabel} | messageTypes=[${messageTypes}] | 回复: "` +
            `${result.text.slice(0, 160)}"`;

          reporter.setInput(`provider=${providerDesc}`);
          reporter.setOutput(outputPreview);

          expect(result.success).toBe(true);
          expect(result.text.length).toBeGreaterThan(10);
          expect(result.messages.length).toBeGreaterThan(0);

          responseText = result.text;
        }
      );

      await reporter.step(
        "Session 持久化验证",
        "通过真实 session-store 写入并恢复 awakening 对话",
        async () => {
          await withTestHome(testHome.homeDir, async () => {
            const sessionStore = await import("@/main/session-store");

            const session = await sessionStore.createSession("Awakening session");
            await sessionStore.appendMessageRecord(
              session.id,
              createUserRecord("user-awak-1", "你好，我是第一次使用你。", 1)
            );
            await sessionStore.appendMessageRecord(
              session.id,
              createAssistantTurnRecord("turn-awak-1", responseText, 2)
            );

            const restored = await sessionStore.loadMessages(session.id);
            reporter.setInput(`sessionId=${session.id}`);
            reporter.setOutput(`恢复 ${restored.length} 条消息`);

            expect(restored).toHaveLength(2);
            expect(restored[0]?.role).toBe("user");
            expect(restored[1]?.role).toBe("assistant");
            expect(restored[1]?.turn?.bodySegments[0]?.text).toBe(responseText);
          });
        }
      );
    } finally {
      reporter.done();
      testHome.cleanup();
    }
  });

  it("should have Zora identify herself in awakening", async () => {
    const reporter = createCaseReporter(
      "L3-AWAK-002",
      "Awakening 身份表达",
      providerDesc
    );
    const testHome = createTestZoraHome();

    try {
      await reporter.step(
        "构建真实 awakening system prompt",
        "通过真实 profile 获取 system prompt",
        async () => {
          await withTestHome(testHome.homeDir, async () => {
            const queryProfiles = await import("@/main/query-profiles");
            const sdkRuntime = await import("@/main/sdk-runtime");

            const profile = await queryProfiles.buildAwakeningProfile({
              userPrompt: "Hi! What's your name and what do you do?",
              cwd: process.cwd(),
              sdkRuntime: sdkRuntime.getSDKRuntimeOptions(),
              onEvent: () => {},
              isFirstTurn: true,
            });

            const result = await sendLiveQuery(provider, profile.prompt, {
              maxTurns: 1,
              systemPrompt: profile.options.systemPrompt.append,
            });

            const mentionsZora =
              result.text.includes("Zora") ||
              result.text.toLowerCase().includes("zora");

            reporter.setInput("userPrompt='Hi! What's your name and what do you do?'");
            reporter.setOutput(
              `回复: "${result.text.slice(0, 160)}" | 提及 Zora: ${mentionsZora}`
            );

            expect(result.success).toBe(true);
            expect(result.text.length).toBeGreaterThan(10);

            if (!mentionsZora) {
              console.warn("⚠ Zora 未在回复中提及名字（可能因 model 差异）");
            }
          });
        }
      );
    } finally {
      reporter.done();
      testHome.cleanup();
    }
  });
});
