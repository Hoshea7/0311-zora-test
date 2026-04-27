import { generateSmartTitle } from "@/renderer/utils/title";

describe("generateSmartTitle", () => {
  it("returns the default title for empty messages", () => {
    expect(generateSmartTitle("   ")).toBe("新会话");
  });

  it("returns short messages unchanged", () => {
    expect(generateSmartTitle("帮我总结一下今天的会议重点")).toBe("帮我总结一下今天的会议重点");
  });

  it("truncates long Chinese text at punctuation and adds an ellipsis", () => {
    expect(generateSmartTitle("你好你好你好，你好你好你好你好", 7)).toBe("你好你好你好…");
  });

  it("truncates long English text at a space and adds an ellipsis", () => {
    expect(generateSmartTitle("alpha beta gamma delta epsilon", 12)).toBe("alpha beta…");
  });

  it("handles mixed Chinese and English content", () => {
    expect(generateSmartTitle("Alpha 测试 Beta 测试 Gamma", 12)).toBe("Alpha 测试…");
  });

  it("cuts at sentence-ending punctuation when it appears within range", () => {
    expect(
      generateSmartTitle("First sentence. Second sentence keeps going with more detail", 20)
    ).toBe("First sentence");
  });
});
