import { safeStorage } from "electron";
import {
  readSecret,
  readSecretDetailed,
  storeSecret,
} from "@/main/utils/secret-storage";

describe("setup-main safeStorage mock", () => {
  it("provides a working round-trip encryption mock", () => {
    const encrypted = safeStorage.encryptString("zora-secret");

    expect(Buffer.isBuffer(encrypted)).toBe(true);
    expect(safeStorage.decryptString(encrypted)).toBe("zora-secret");
  });
});

describe("main utils/secret-storage", () => {
  it("round-trips stored secrets through the current passthrough implementation", () => {
    const stored = storeSecret("zora-secret");

    expect(readSecret(stored)).toBe("zora-secret");
  });

  it("handles empty strings", () => {
    const stored = storeSecret("");

    expect(readSecret(stored)).toBe("");
  });

  it("reports that no write-back migration is needed", () => {
    expect(readSecretDetailed("zora-secret")).toEqual({
      value: "zora-secret",
      needsWriteBack: false,
    });
  });
});
