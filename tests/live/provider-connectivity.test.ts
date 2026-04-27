import {
  expect,
  it,
} from "vitest";
import { describeLive } from "./helpers/skip-guard";
import { sendLiveQuery } from "./helpers/sdk-harness";
import { createCaseReporter } from "./helpers/step-reporter";

describeLive("Provider Connectivity", (provider) => {
  const providerDesc = `${provider.name} (${provider.model || "default"})`;

  it("should send a simple query and receive a response", async () => {
    const reporter = createCaseReporter(
      "L3-CONN-001a",
      "Provider 连通性-简单请求",
      providerDesc
    );

    try {
      await reporter.step("发送简单请求", "要求模型返回固定文本", async () => {
        const result = await sendLiveQuery(
          provider,
          'Reply with exactly the text "ZORA_LIVE_OK" and nothing else.'
        );

        reporter.setInput('Reply with exactly "ZORA_LIVE_OK"');
        reporter.setOutput(`回复: "${result.text.slice(0, 120)}"`);

        expect(result.success).toBe(true);
        expect(result.text.length).toBeGreaterThan(0);
        expect(result.messages.length).toBeGreaterThan(0);
      });
    } finally {
      reporter.done();
    }
  });

  it("should receive at least one assistant message", async () => {
    const reporter = createCaseReporter(
      "L3-CONN-001b",
      "Provider 连通性-消息结构",
      providerDesc
    );

    try {
      await reporter.step("检查首条消息结构", "发送一句问候并观察 SDK 消息帧", async () => {
        const result = await sendLiveQuery(provider, "Say hello in one sentence.");
        const preview =
          result.messages.length > 0
            ? JSON.stringify(result.messages[0], null, 2).slice(0, 300)
            : "(no message)";

        reporter.setInput("'Say hello in one sentence.'");
        reporter.setOutput(preview);

        expect(result.success).toBe(true);
        expect(result.messages.length).toBeGreaterThan(0);
      });
    } finally {
      reporter.done();
    }
  });

  it("should respect maxTurns=1 and complete", async () => {
    const reporter = createCaseReporter(
      "L3-CONN-001c",
      "Provider 连通性-maxTurns",
      providerDesc
    );

    try {
      await reporter.step("限制 maxTurns=1", "发送简单算术题并确认请求完成", async () => {
        const result = await sendLiveQuery(provider, "What is 2 + 2?", {
          maxTurns: 1,
        });

        reporter.setInput("prompt='What is 2 + 2?' maxTurns=1");
        reporter.setOutput(`回复: "${result.text.slice(0, 120)}"`);

        expect(result.success).toBe(true);
        expect(result.text).toBeTruthy();
      });
    } finally {
      reporter.done();
    }
  });
});
