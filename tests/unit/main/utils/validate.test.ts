import {
  normalizeBoolean,
  normalizeOptionalString,
  normalizeRequiredString,
} from "@/main/utils/validate";

describe("normalizeRequiredString", () => {
  it("trims valid strings", () => {
    expect(normalizeRequiredString("  hello  ", "name")).toBe("hello");
  });

  it("throws for empty strings", () => {
    expect(() => normalizeRequiredString("   ", "name")).toThrow("name is required.");
  });

  it("throws for non-string values", () => {
    expect(() => normalizeRequiredString(123, "name")).toThrow("name is required.");
  });
});

describe("normalizeOptionalString", () => {
  it("returns trimmed strings when present", () => {
    expect(normalizeOptionalString("  hello  ")).toBe("hello");
  });

  it("returns null for blank strings", () => {
    expect(normalizeOptionalString("   ")).toBeNull();
  });

  it("returns null for non-string values", () => {
    expect(normalizeOptionalString(123)).toBeNull();
    expect(normalizeOptionalString(undefined)).toBeNull();
  });
});

describe("normalizeBoolean", () => {
  it("returns boolean values unchanged", () => {
    expect(normalizeBoolean(true, "enabled")).toBe(true);
    expect(normalizeBoolean(false, "enabled")).toBe(false);
  });

  it("throws for non-boolean values", () => {
    expect(() => normalizeBoolean("true", "enabled")).toThrow(
      "enabled must be a boolean."
    );
  });
});
