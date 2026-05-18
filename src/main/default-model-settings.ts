import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_DEFAULT_MODEL_SETTINGS,
  type DefaultModelSettings,
} from "../shared/types/default-model";
import type { ProviderConfig } from "../shared/types/provider";
import { providerManager } from "./provider-manager";
import { ZORA_DIR } from "./utils/fs";
import { isRecord } from "./utils/guards";
import { normalizeOptionalString } from "./utils/validate";

const SETTINGS_PATH = path.join(ZORA_DIR, "default-model-settings.json");

let cached: DefaultModelSettings | null = null;

function normalizeDefaultModelSettings(value: unknown): DefaultModelSettings {
  if (!isRecord(value)) {
    return { ...DEFAULT_DEFAULT_MODEL_SETTINGS };
  }

  const defaultProviderId = normalizeOptionalString(value.defaultProviderId);
  const defaultModelId = normalizeOptionalString(value.defaultModelId);

  return {
    defaultProviderId,
    defaultModelId: defaultProviderId ? defaultModelId : null,
  };
}

function hasConfiguredModel(provider: ProviderConfig, requestedModelId?: string | null): boolean {
  const normalizedRequestedModelId = normalizeOptionalString(requestedModelId);
  if (!normalizedRequestedModelId) {
    return false;
  }

  if (normalizeOptionalString(provider.modelId) === normalizedRequestedModelId) {
    return true;
  }

  return Object.values(provider.roleModels ?? {}).some(
    (modelId) => normalizeOptionalString(modelId) === normalizedRequestedModelId
  );
}

export async function loadDefaultModelSettings(): Promise<DefaultModelSettings> {
  if (cached) {
    return { ...cached };
  }

  try {
    const raw = await readFile(SETTINGS_PATH, "utf8");
    cached = normalizeDefaultModelSettings(JSON.parse(raw));
  } catch {
    cached = { ...DEFAULT_DEFAULT_MODEL_SETTINGS };
  }

  return { ...cached };
}

export async function saveDefaultModelSettings(
  settings: DefaultModelSettings
): Promise<void> {
  const normalized = normalizeDefaultModelSettings(settings);
  await mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
  await writeFile(SETTINGS_PATH, JSON.stringify(normalized, null, 2), "utf8");
  cached = normalized;
}

export async function resolveDefaultModelTarget(): Promise<{
  provider: ProviderConfig;
  apiKey: string;
  selectedModelId?: string;
} | null> {
  const settings = await loadDefaultModelSettings();

  if (settings.defaultProviderId) {
    const configured = await providerManager.getProviderByIdWithKey(
      settings.defaultProviderId
    );

    if (configured?.provider.enabled) {
      return {
        ...configured,
        selectedModelId: hasConfiguredModel(
          configured.provider,
          settings.defaultModelId
        )
          ? settings.defaultModelId ?? undefined
          : undefined,
      };
    }
  }

  const fallback = await providerManager.getDefaultProviderWithKey();
  return fallback?.provider.enabled
    ? {
        ...fallback,
        selectedModelId: undefined,
      }
    : null;
}
