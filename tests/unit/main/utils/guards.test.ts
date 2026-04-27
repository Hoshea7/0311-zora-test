import { isRecord } from "@/main/utils/guards";

describe("isRecord", () => {
  it("returns true for non-null objects", () => {
    expect(isRecord({ name: "Zora" })).toBe(true);
    expect(isRecord([])).toBe(true);
  });

  it("returns false for null and primitive values", () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord("zora")).toBe(false);
    expect(isRecord(123)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord(false)).toBe(false);
  });
});
