import { createCanUseTool } from "../hitl";
import { buildProviderSdkEnv, providerManager } from "../provider-manager";
import { buildZoraSystemPrompt } from "../prompt-builder";
import { getZoraPluginPath } from "../skill-manager";
import type { ProfileBuildContext, QueryProfile } from "./types";

export async function buildProductivityProfile(ctx: ProfileBuildContext): Promise<QueryProfile> {
  const systemPrompt = await buildZoraSystemPrompt();
  let env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    CLAUDE_AGENT_SDK_CLIENT_APP: "zora-agent",
  };

  const activeProvider = await providerManager.getDefaultProvider();

  if (activeProvider) {
    console.log("[productivity] Active provider:", {
      id: activeProvider.id,
      name: activeProvider.name,
      providerType: activeProvider.providerType,
      baseUrl: activeProvider.baseUrl,
      modelId: activeProvider.modelId ?? "(default model)",
      isDefault: activeProvider.isDefault,
      enabled: activeProvider.enabled,
    });

    const decryptedApiKey = await providerManager.decryptApiKey(activeProvider.id);

    if (!decryptedApiKey) {
      throw new Error("Failed to decrypt API Key for the active provider.");
    }

    env = buildProviderSdkEnv({
      apiKey: decryptedApiKey,
      baseUrl: activeProvider.baseUrl,
      modelId: activeProvider.modelId,
      baseEnv: env,
    });
    env.CLAUDE_AGENT_SDK_CLIENT_APP = "zora-agent";
  } else {
    console.log(
      "[productivity] No active provider configured. Falling back to process.env provider settings."
    );
  }

  const options: QueryProfile["options"] = {
    cwd: ctx.cwd,
    pathToClaudeCodeExecutable: ctx.sdkCliPath,
    executable: "node",
    executableArgs: [],
    maxTurns: 50,
    persistSession: true,
    includePartialMessages: true,
    env,
    plugins: [
      { type: "local" as const, path: getZoraPluginPath() },
    ],
    systemPrompt,
    permissionMode: "default",
    canUseTool: createCanUseTool(ctx.onEvent) as QueryProfile["options"]["canUseTool"],
  };

  if (ctx.sessionId) {
    options.resume = ctx.sessionId;
  }

  return { name: "productivity", prompt: ctx.userPrompt, options };
}
