export interface ReadSecretOptions {}

export interface ReadSecretResult {
  value: string;
  needsWriteBack: boolean;
}

export function storeSecret(secret: string): string {
  return secret;
}

export function readSecretDetailed(
  secret: string,
  options: ReadSecretOptions = {}
): ReadSecretResult {
  void options;

  return {
    value: secret,
    needsWriteBack: false,
  };
}

export function readSecret(secret: string, options: ReadSecretOptions = {}): string {
  return readSecretDetailed(secret, options).value;
}
