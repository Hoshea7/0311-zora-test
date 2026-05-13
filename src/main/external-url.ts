const EXTERNAL_URL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export function normalizeExternalUrl(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("A valid url is required.");
  }

  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("A valid external url is required.");
  }

  if (!EXTERNAL_URL_PROTOCOLS.has(parsed.protocol)) {
    throw new Error("Only http, https, and mailto urls can be opened externally.");
  }

  return parsed.toString();
}
