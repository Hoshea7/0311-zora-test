import { randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  rename as fsRename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { safeStorage } from "electron";
import type {
  ProviderConfig,
  ProviderCreateInput,
  ProviderTestResult,
  ProviderType,
  ProviderUpdateInput,
} from "../shared/types/provider";

const MASKED_API_KEY = "••••••";
const ZORA_DIR = path.join(homedir(), ".zora");
const PROVIDERS_FILE = path.join(ZORA_DIR, "providers.json");
const PROVIDER_TYPES = new Set<ProviderType>([
  "anthropic",
  "volcengine",
  "zhipu",
  "moonshot",
  "deepseek",
  "custom",
]);

async function replaceFileAtomically(filePath: string, content: string): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, content, "utf8");

  try {
    await fsRename(tmpPath, filePath);
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code: string }).code
        : "";

    if (code === "EEXIST" || code === "EPERM") {
      try {
        await unlink(filePath);
      } catch {
        // Ignore missing destination file.
      }

      await fsRename(tmpPath, filePath);
      return;
    }

    try {
      await unlink(tmpPath);
    } catch {
      // Ignore temp cleanup failures.
    }

    throw error;
  }
}

function normalizeRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} is required.`);
  }

  return value.trim();
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isProviderType(value: unknown): value is ProviderType {
  return typeof value === "string" && PROVIDER_TYPES.has(value as ProviderType);
}

export class ProviderManager {
  private async ensureStorage(): Promise<void> {
    await mkdir(ZORA_DIR, { recursive: true });

    try {
      await access(PROVIDERS_FILE);
    } catch {
      await replaceFileAtomically(PROVIDERS_FILE, "[]\n");
    }
  }

  private async readProviders(): Promise<ProviderConfig[]> {
    await this.ensureStorage();

    try {
      const raw = await readFile(PROVIDERS_FILE, "utf8");
      const parsed = JSON.parse(raw) as unknown;

      if (!Array.isArray(parsed)) {
        throw new Error("Provider config file is malformed.");
      }

      return parsed as ProviderConfig[];
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "ENOENT"
      ) {
        return [];
      }

      throw error;
    }
  }

  private async writeProviders(providers: ProviderConfig[]): Promise<void> {
    await this.ensureStorage();
    await replaceFileAtomically(PROVIDERS_FILE, `${JSON.stringify(providers, null, 2)}\n`);
  }

  private encryptApiKey(plainKey: string): string {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("safeStorage encryption is unavailable on this device.");
    }

    return safeStorage.encryptString(plainKey).toString("base64");
  }

  private decryptApiKeyValue(encryptedKey: string): string {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("safeStorage decryption is unavailable on this device.");
    }

    return safeStorage.decryptString(Buffer.from(encryptedKey, "base64"));
  }

  private maskProvider(provider: ProviderConfig): ProviderConfig {
    return {
      ...provider,
      apiKey: MASKED_API_KEY,
    };
  }

  private rebalanceDefaultProvider(providers: ProviderConfig[]): ProviderConfig[] {
    if (providers.length === 0) {
      return providers;
    }

    const defaultProvider =
      providers.find((provider) => provider.isDefault && provider.enabled) ??
      providers.find((provider) => provider.enabled) ??
      providers.find((provider) => provider.isDefault) ??
      providers[0];

    return providers.map((provider) => ({
      ...provider,
      isDefault: provider.id === defaultProvider.id,
    }));
  }

  async list(): Promise<ProviderConfig[]> {
    const providers = await this.readProviders();
    return providers.map((provider) => this.maskProvider(provider));
  }

  async create(input: ProviderCreateInput): Promise<ProviderConfig> {
    if (!isProviderType(input.providerType)) {
      throw new Error("A valid providerType is required.");
    }

    const providers = await this.readProviders();
    const now = Date.now();
    const provider: ProviderConfig = {
      id: randomUUID(),
      name: normalizeRequiredString(input.name, "Provider name"),
      providerType: input.providerType,
      baseUrl: normalizeRequiredString(input.baseUrl, "Base URL"),
      apiKey: this.encryptApiKey(normalizeRequiredString(input.apiKey, "API Key")),
      modelId: normalizeOptionalString(input.modelId),
      enabled: true,
      isDefault: providers.length === 0,
      createdAt: now,
      updatedAt: now,
    };

    const nextProviders = this.rebalanceDefaultProvider([...providers, provider]);
    await this.writeProviders(nextProviders);

    const createdProvider = nextProviders.find((item) => item.id === provider.id);
    if (!createdProvider) {
      throw new Error("Failed to create provider.");
    }

    return this.maskProvider(createdProvider);
  }

  async update(id: string, input: ProviderUpdateInput): Promise<ProviderConfig> {
    const providerId = normalizeRequiredString(id, "Provider ID");
    const providers = await this.readProviders();
    const index = providers.findIndex((provider) => provider.id === providerId);

    if (index === -1) {
      throw new Error("Provider not found.");
    }

    if (input.providerType !== undefined && !isProviderType(input.providerType)) {
      throw new Error("A valid providerType is required.");
    }

    const currentProvider = providers[index];
    const nextProvider: ProviderConfig = {
      ...currentProvider,
      name:
        input.name !== undefined
          ? normalizeRequiredString(input.name, "Provider name")
          : currentProvider.name,
      providerType: input.providerType ?? currentProvider.providerType,
      baseUrl:
        input.baseUrl !== undefined
          ? normalizeRequiredString(input.baseUrl, "Base URL")
          : currentProvider.baseUrl,
      modelId:
        input.modelId !== undefined
          ? normalizeOptionalString(input.modelId)
          : currentProvider.modelId,
      enabled: typeof input.enabled === "boolean" ? input.enabled : currentProvider.enabled,
      updatedAt: Date.now(),
    };

    const nextApiKey = normalizeOptionalString(input.apiKey);
    if (nextApiKey) {
      nextProvider.apiKey = this.encryptApiKey(nextApiKey);
    }

    const nextProviders = [...providers];
    nextProviders[index] = nextProvider;

    const balancedProviders = this.rebalanceDefaultProvider(nextProviders);
    await this.writeProviders(balancedProviders);

    const updatedProvider = balancedProviders.find((provider) => provider.id === providerId);
    if (!updatedProvider) {
      throw new Error("Provider not found after update.");
    }

    return this.maskProvider(updatedProvider);
  }

  async delete(id: string): Promise<void> {
    const providerId = normalizeRequiredString(id, "Provider ID");
    const providers = await this.readProviders();
    const nextProviders = providers.filter((provider) => provider.id !== providerId);

    if (nextProviders.length === providers.length) {
      throw new Error("Provider not found.");
    }

    await this.writeProviders(this.rebalanceDefaultProvider(nextProviders));
  }

  async getDefaultProvider(): Promise<ProviderConfig | null> {
    const providers = await this.readProviders();
    return (
      providers.find((provider) => provider.isDefault) ??
      providers.find((provider) => provider.enabled) ??
      providers[0] ??
      null
    );
  }

  async decryptApiKey(providerId: string): Promise<string | null> {
    const id = normalizeRequiredString(providerId, "Provider ID");
    const providers = await this.readProviders();
    const provider = providers.find((item) => item.id === id);

    if (!provider) {
      return null;
    }

    return this.decryptApiKeyValue(provider.apiKey);
  }

  async setDefault(providerId: string): Promise<void> {
    const id = normalizeRequiredString(providerId, "Provider ID");
    const providers = await this.readProviders();

    if (!providers.some((provider) => provider.id === id)) {
      throw new Error("Provider not found.");
    }

    const nextProviders = providers.map((provider) => ({
      ...provider,
      isDefault: provider.id === id,
      updatedAt: provider.id === id ? Date.now() : provider.updatedAt,
    }));

    await this.writeProviders(nextProviders);
  }

  async hasConfigured(): Promise<boolean> {
    const providers = await this.readProviders();
    return providers.some((provider) => provider.enabled);
  }

  async testConnection(): Promise<ProviderTestResult> {
    return {
      success: false,
      message: "Provider connection testing is not implemented yet.",
    };
  }
}
