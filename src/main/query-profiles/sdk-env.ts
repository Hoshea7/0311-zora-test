import { buildProviderSdkEnv, providerManager } from "../provider-manager";

export async function resolveSdkEnvForProfile(
  profileName: "awakening" | "productivity" | "memory",
  options?: {
    providerId?: string;
    selectedModelId?: string;
  }
): Promise<Record<string, string>> {
  let env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    CLAUDE_AGENT_SDK_CLIENT_APP: "zora",
  };

  let result = options?.providerId
    ? await providerManager.getProviderByIdWithKey(options.providerId)
    : await providerManager.getDefaultProviderWithKey();

  if (!result && options?.providerId) {
    console.warn(
      `[${profileName}] Locked provider ${options.providerId} not found. Falling back to default provider.`
    );
    result = await providerManager.getDefaultProviderWithKey();
  }

  if (!result) {
    console.log(
      `[${profileName}] No active provider configured. Falling back to process.env provider settings.`
    );
    return env;
  }

  const { provider, apiKey } = result;
  const effectiveModelId = options?.selectedModelId ?? provider.modelId;

  console.log(`[${profileName}] Active provider:`, {
    lockedProviderId: options?.providerId ?? "(default)",
    selectedModelId: options?.selectedModelId ?? "(provider default)",
    providerId: provider.id,
    name: provider.name,
    providerType: provider.providerType,
    baseUrl: provider.baseUrl,
    modelId: effectiveModelId ?? "(default model)",
  });

  env = buildProviderSdkEnv({
    apiKey,
    baseUrl: provider.baseUrl,
    modelId: effectiveModelId,
    roleModels: provider.roleModels,
    baseEnv: env,
  });
  env.CLAUDE_AGENT_SDK_CLIENT_APP = "zora";

  return env;
}
