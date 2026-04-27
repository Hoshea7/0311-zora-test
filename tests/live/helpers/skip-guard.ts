import { describe } from "vitest";
import { resolveTestProvider, type TestProviderConfig } from "./resolve-test-provider";

export function describeLive(
  name: string,
  fn: (provider: TestProviderConfig) => void
) {
  const provider = resolveTestProvider();

  if (!provider) {
    describe.skip(`[LIVE] ${name} (no provider configured)`, () => {
      // Empty skip block so the live suite is reported as skipped.
    });
    return;
  }

  describe(`[LIVE] ${name}`, () => {
    fn(provider);
  });
}
