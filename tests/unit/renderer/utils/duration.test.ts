import { formatDuration } from "@/renderer/utils/duration";

describe("formatDuration", () => {
  it("shows sub-second durations as less than one second", () => {
    expect(formatDuration(250)).toBe("<1s");
  });

  it("formats durations under a minute with one decimal place", () => {
    expect(formatDuration(1_500)).toBe("1.5s");
  });

  it("formats exact minutes with zero remaining seconds", () => {
    expect(formatDuration(60_000)).toBe("1m 0s");
  });

  it("formats minute-plus durations using whole seconds", () => {
    expect(formatDuration(125_400)).toBe("2m 5s");
  });
});
