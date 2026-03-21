import { buildProviderSdkEnv, providerManager } from "../provider-manager";
import { loadMemorySettings } from "../memory-settings";

export async function resolveSdkEnvForProfile(
  profileName: "awakening" | "productivity" | "memory"
): Promise<Record<string, string>> {
  let env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    CLAUDE_AGENT_SDK_CLIENT_APP: "zora",
  };

  let result = null;

  if (profileName === "memory") {
    try {
      const settings = await loadMemorySettings();
      if (settings.memoryProviderId) {
        result = await providerManager.getProviderByIdWithKey(settings.memoryProviderId);
        if (result?.provider.enabled) {
          console.log(
            `[${profileName}] Using dedicated memory provider: ${result.provider.name}`
          );
        } else {
          console.log(
            `[${profileName}] Configured memory provider (${settings.memoryProviderId}) not found or disabled; falling back to default.`
          );
          result = null;
        }
      }
    } catch (err) {
      console.warn(
        `[${profileName}] Failed to load memory settings; falling back to default:`,
        err
      );
    }
  }

  if (!result) {
    result = await providerManager.getDefaultProviderWithKey();
  }

  if (!result) {
    console.log(
      `[${profileName}] No active provider configured. Falling back to process.env provider settings.`
    );
    return env;
  }

  const { provider, apiKey } = result;

  console.log(`[${profileName}] Active provider:`, {
    name: provider.name,
    providerType: provider.providerType,
    baseUrl: provider.baseUrl,
    modelId: provider.modelId ?? "(default model)",
  });

  env = buildProviderSdkEnv({
    apiKey,
    baseUrl: provider.baseUrl,
    modelId: provider.modelId,
    baseEnv: env,
  });
  env.CLAUDE_AGENT_SDK_CLIENT_APP = "zora";

  return env;
}
