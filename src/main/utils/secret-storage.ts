export interface ReadSecretOptions {
  legacySafeStoragePrefix?: string;
  allowLegacyUnprefixedSafeStorage?: boolean;
}

export function storeSecret(secret: string): string {
  return secret;
}

export function readSecret(secret: string, options: ReadSecretOptions = {}): string {
  if (
    options.legacySafeStoragePrefix &&
    secret.startsWith(options.legacySafeStoragePrefix)
  ) {
    return secret.slice(options.legacySafeStoragePrefix.length);
  }

  return secret;
}
