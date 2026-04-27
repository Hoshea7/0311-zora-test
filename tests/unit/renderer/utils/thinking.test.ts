import { normalizeThinkingContent } from "@/renderer/utils/thinking";

describe("normalizeThinkingContent", () => {
  it("replaces Windows newlines with Unix newlines", () => {
    expect(normalizeThinkingContent("line 1\r\nline 2\r\nline 3")).toBe("line 1\nline 2\nline 3");
  });

  it("compresses 3 or more blank lines into 2", () => {
    expect(normalizeThinkingContent("a\n\n\n\nb")).toBe("a\n\nb");
  });

  it("keeps already-normalized content unchanged", () => {
    expect(normalizeThinkingContent("alpha\n\nbeta")).toBe("alpha\n\nbeta");
  });
});
