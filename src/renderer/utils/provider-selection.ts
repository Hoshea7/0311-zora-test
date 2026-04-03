import type { DefaultModelSettings } from "../../shared/types/default-model";
import type { ProviderConfig } from "../../shared/types/provider";
import type { Session } from "../types";

export interface ProviderModelOption {
  modelId: string;
  label: string;
}

export function normalizeOptionalModelId(
  value?: string | null
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function getProviderModels(provider: ProviderConfig): ProviderModelOption[] {
  const modelMap = new Map<string, string[]>();
  const normalizedModelId = normalizeOptionalModelId(provider.modelId);

  if (normalizedModelId) {
    modelMap.set(normalizedModelId, ["主模型"]);
  }

  const roleEntries = [
    { key: "sonnetModel", label: "Sonnet" },
    { key: "opusModel", label: "Opus" },
    { key: "haikuModel", label: "Haiku" },
    { key: "smallFastModel", label: "Small" },
  ] as const;

  for (const { key, label } of roleEntries) {
    const modelId = normalizeOptionalModelId(provider.roleModels?.[key]);
    if (!modelId) {
      continue;
    }

    const existing = modelMap.get(modelId);
    if (existing) {
      existing.push(label);
    } else {
      modelMap.set(modelId, [label]);
    }
  }

  return Array.from(modelMap.entries()).map(([modelId, labels]) => ({
    modelId,
    label: labels.join(" / "),
  }));
}

export function resolveActiveProvider(
  providers: ProviderConfig[]
): ProviderConfig | null {
  return (
    providers.find((provider) => provider.isDefault) ??
    providers.find((provider) => provider.enabled) ??
    null
  );
}

export function resolveLockedProvider(
  providers: ProviderConfig[],
  session: Session | null
): ProviderConfig | null {
  if (!session?.providerLocked || !session.providerId) {
    return null;
  }

  return providers.find((provider) => provider.id === session.providerId) ?? null;
}

export function isLockedProviderMissing(
  providers: ProviderConfig[],
  session: Session | null
): boolean {
  return Boolean(
    session?.providerLocked &&
      session.providerId &&
      !providers.some((provider) => provider.id === session.providerId)
  );
}

export function resolveSelectedModelId(
  provider: ProviderConfig | null,
  requestedModelId?: string
): string | undefined {
  if (!provider) {
    return undefined;
  }

  const normalizedRequestedModelId = normalizeOptionalModelId(requestedModelId);
  const models = getProviderModels(provider);

  if (
    normalizedRequestedModelId &&
    models.some((model) => model.modelId === normalizedRequestedModelId)
  ) {
    return normalizedRequestedModelId;
  }

  return normalizeOptionalModelId(provider.modelId) ?? models[0]?.modelId;
}

export function resolveConfiguredDefaultTarget(
  providers: ProviderConfig[],
  settings?: DefaultModelSettings | null
): {
  provider: ProviderConfig | null;
  modelId?: string;
} {
  const fallbackProvider = resolveActiveProvider(providers);

  if (!settings?.defaultProviderId) {
    return {
      provider: fallbackProvider,
      modelId: resolveSelectedModelId(fallbackProvider),
    };
  }

  const configuredProvider =
    providers.find(
      (provider) => provider.id === settings.defaultProviderId && provider.enabled
    ) ?? fallbackProvider;

  return {
    provider: configuredProvider,
    modelId: resolveSelectedModelId(
      configuredProvider,
      configuredProvider?.id === settings.defaultProviderId
        ? settings.defaultModelId ?? undefined
        : undefined
    ),
  };
}

export function resolveSelectedModelOverride(
  provider: ProviderConfig | null,
  requestedModelId?: string
): string {
  const resolvedModelId = resolveSelectedModelId(provider, requestedModelId);
  const providerModelId = normalizeOptionalModelId(provider?.modelId);

  if (!resolvedModelId || resolvedModelId === providerModelId) {
    return "";
  }

  return resolvedModelId;
}

export function resolveDraftProviderAndModel(
  providers: ProviderConfig[],
  settings: DefaultModelSettings | null | undefined,
  provider: ProviderConfig | null,
  requestedModelId?: string
): {
  providerId?: string;
  modelId?: string;
} {
  const resolvedModelId = resolveSelectedModelId(provider, requestedModelId);
  const configuredDefault = resolveConfiguredDefaultTarget(providers, settings);

  if (
    !provider ||
    !resolvedModelId ||
    (configuredDefault.provider?.id === provider.id &&
      configuredDefault.modelId === resolvedModelId)
  ) {
    return {};
  }

  const providerDefaultModelId = resolveSelectedModelId(provider);
  const shouldPersistProviderId = configuredDefault.provider?.id !== provider.id;

  return {
    providerId: shouldPersistProviderId ? provider.id : undefined,
    modelId:
      shouldPersistProviderId && providerDefaultModelId === resolvedModelId
        ? undefined
        : resolvedModelId,
  };
}

export function resolveCurrentProviderAndModel(
  providers: ProviderConfig[],
  session: Session | null,
  settings?: DefaultModelSettings | null,
  draftSelectedProviderId?: string,
  draftSelectedModelId?: string
): {
  provider: ProviderConfig | null;
  modelId?: string;
  isLocked: boolean;
  isMissingLockedProvider: boolean;
} {
  const isLocked = Boolean(session?.providerLocked);
  const isMissingLockedProvider = isLockedProviderMissing(providers, session);

  if (isLocked) {
    const provider = resolveLockedProvider(providers, session);
    return {
      provider,
      modelId: resolveSelectedModelId(provider, session?.selectedModelId),
      isLocked,
      isMissingLockedProvider,
    };
  }

  const configuredDefault = resolveConfiguredDefaultTarget(providers, settings);
  const draftProvider =
    (draftSelectedProviderId
      ? providers.find(
          (provider) => provider.id === draftSelectedProviderId && provider.enabled
        ) ?? null
      : null) ?? configuredDefault.provider;

  return {
    provider: draftProvider,
    modelId:
      draftSelectedProviderId || draftSelectedModelId
        ? resolveSelectedModelId(draftProvider, draftSelectedModelId)
        : configuredDefault.modelId,
    isLocked,
    isMissingLockedProvider,
  };
}
