import type { ProviderConfig } from "../../shared/types/provider";
import { buildProviderSdkEnv, providerManager } from "../provider-manager";
import { loadMemorySettings } from "../memory-settings";
import { resolveDefaultModelTarget } from "../default-model-settings";
import { logAgentEvent } from "../agent-loop-log";

function normalizeOptionalModelId(value?: string | null): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function hasConfiguredModel(provider: ProviderConfig, modelId?: string | null): boolean {
  const normalizedModelId = normalizeOptionalModelId(modelId);
  if (!normalizedModelId) {
    return false;
  }

  if (normalizeOptionalModelId(provider.modelId) === normalizedModelId) {
    return true;
  }

  return Object.values(provider.roleModels ?? {}).some(
    (value) => normalizeOptionalModelId(value) === normalizedModelId
  );
}

function resolveMemoryRequestedModelId(
  provider: ProviderConfig,
  modelId?: string | null
): string | undefined {
  const normalizedModelId = normalizeOptionalModelId(modelId);
  const providerDefaultModelId = normalizeOptionalModelId(provider.modelId);

  if (
    normalizedModelId &&
    providerDefaultModelId &&
    normalizedModelId === providerDefaultModelId
  ) {
    return undefined;
  }

  return normalizedModelId;
}

export async function resolveSdkEnvForProfile(
  profileName: "productivity" | "memory",
  options?: {
    providerId?: string;
    selectedModelId?: string;
  }
): Promise<Record<string, string>> {
  let env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    CLAUDE_AGENT_SDK_CLIENT_APP: "zora",
  };

  let result: Awaited<ReturnType<typeof providerManager.getProviderByIdWithKey>> | null = null;
  let memorySelectedModelId: string | undefined;
  let defaultSelectedModelId: string | undefined;

  if (options?.providerId) {
    result = await providerManager.getProviderByIdWithKey(options.providerId);
    if (!result) {
      logAgentEvent(
        "pre",
        "model:fallback",
        "模型配置回退",
        {
          profile: profileName,
          providerId: options.providerId,
          reason: "locked_provider_not_found",
        },
        { level: "warn" }
      );
    }
  }

  if (!result && profileName === "memory") {
    try {
      const settings = await loadMemorySettings();
      if (settings.memoryProviderId) {
        result = await providerManager.getProviderByIdWithKey(
          settings.memoryProviderId
        );
        if (result && !result.provider.enabled) {
          logAgentEvent(
            "pre",
            "model:fallback",
            "模型配置回退",
            {
              profile: profileName,
              providerId: settings.memoryProviderId,
              reason: "memory_provider_disabled",
            },
            { level: "warn" }
          );
          result = null;
        }
        if (result) {
          memorySelectedModelId = resolveMemoryRequestedModelId(
            result.provider,
            settings.memoryModelId
          );
          logAgentEvent("pre", "model", "模型已确认", {
            profile: profileName,
            provider: result.provider.name,
          });
        }
      }
    } catch (err) {
      logAgentEvent(
        "pre",
        "model:fallback",
        "模型配置回退",
        {
          profile: profileName,
          reason: "memory_settings_failed",
          error: err instanceof Error ? err.message : String(err),
        },
        { level: "warn" }
      );
    }
  }

  if (!result && profileName !== "memory") {
    const defaultTarget = await resolveDefaultModelTarget();
    if (defaultTarget) {
      result = {
        provider: defaultTarget.provider,
        apiKey: defaultTarget.apiKey,
      };
      defaultSelectedModelId = defaultTarget.selectedModelId;
    }
  }

  if (!result) {
    result = await providerManager.getDefaultProviderWithKey();
  }

  if (!result) {
    logAgentEvent("pre", "model", "模型已确认", {
      profile: profileName,
      source: "process.env",
      reason: "no_active_provider",
    });
    return env;
  }

  const { provider, apiKey } = result;
  const requestedModelId = normalizeOptionalModelId(
    options?.selectedModelId ?? memorySelectedModelId ?? defaultSelectedModelId
  );
  const effectiveModelId =
    requestedModelId && hasConfiguredModel(provider, requestedModelId)
      ? requestedModelId
      : provider.modelId;

  if (requestedModelId && effectiveModelId !== requestedModelId) {
    logAgentEvent(
      "pre",
      "model:fallback",
      "模型配置回退",
      {
        profile: profileName,
        provider: provider.name,
        requestedModel: requestedModelId,
        model: effectiveModelId,
        reason: "requested_model_not_configured",
      },
      { level: "warn" }
    );
  }

  logAgentEvent("pre", "model", "模型已确认", {
    profile: profileName,
    provider: provider.name,
    providerType: provider.providerType,
    model: effectiveModelId ?? "(default model)",
    selectedModel: requestedModelId ?? "(provider default)",
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
