import { normalizeExternalUrl } from "@/main/external-url";

describe("external url normalization", () => {
  it("accepts browser-safe external URLs", () => {
    expect(normalizeExternalUrl(" https://example.com/docs?q=zora#links ")).toBe(
      "https://example.com/docs?q=zora#links"
    );
    expect(normalizeExternalUrl("http://localhost:5173")).toBe("http://localhost:5173/");
    expect(normalizeExternalUrl("mailto:hello@example.com")).toBe("mailto:hello@example.com");
  });

  it("rejects empty, relative, and unsafe URLs", () => {
    expect(() => normalizeExternalUrl("")).toThrow("A valid url is required.");
    expect(() => normalizeExternalUrl("/docs")).toThrow("A valid external url is required.");
    expect(() => normalizeExternalUrl("file:///etc/passwd")).toThrow(
      "Only http, https, and mailto urls can be opened externally."
    );
    expect(() => normalizeExternalUrl("javascript:alert(1)")).toThrow(
      "Only http, https, and mailto urls can be opened externally."
    );
  });
});
