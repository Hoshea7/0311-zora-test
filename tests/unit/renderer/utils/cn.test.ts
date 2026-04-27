import { cn } from "@/renderer/utils/cn";

describe("cn", () => {
  it("returns a single class name", () => {
    expect(cn("rounded-xl")).toBe("rounded-xl");
  });

  it("joins multiple class names", () => {
    expect(cn("rounded-xl", "shadow-lg")).toBe("rounded-xl shadow-lg");
  });

  it("filters out falsy values", () => {
    expect(cn("rounded-xl", undefined, null, false, "", "shadow-lg")).toBe("rounded-xl shadow-lg");
  });

  it("supports conditional class objects", () => {
    expect(cn("panel", { active: true, hidden: false })).toBe("panel active");
  });
});
