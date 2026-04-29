vi.mock("electron-updater", () => ({
  autoUpdater: {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    logger: null,
    on: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
  },
}));

import {
  getManualUpdateUrl,
  getUpdateInstallModeForPlatform,
  isNewerVersion,
} from "@/main/updater";

describe("main updater platform strategy", () => {
  it("uses automatic installs on Windows", () => {
    expect(getUpdateInstallModeForPlatform("win32")).toBe("automatic");
  });

  it("uses manual installs on macOS and Linux", () => {
    expect(getUpdateInstallModeForPlatform("darwin")).toBe("manual");
    expect(getUpdateInstallModeForPlatform("linux")).toBe("manual");
  });

  it("builds GitHub release URLs for manual updates", () => {
    expect(getManualUpdateUrl("0.1.3")).toBe(
      "https://github.com/Hoshea7/ZoraAgent/releases/tag/v0.1.3"
    );
    expect(getManualUpdateUrl("v0.1.3")).toBe(
      "https://github.com/Hoshea7/ZoraAgent/releases/tag/v0.1.3"
    );
    expect(getManualUpdateUrl()).toBe("https://github.com/Hoshea7/ZoraAgent/releases");
  });

  it("compares release versions for manual update checks", () => {
    expect(isNewerVersion("0.1.3", "0.1.2")).toBe(true);
    expect(isNewerVersion("v0.2.0", "0.1.9")).toBe(true);
    expect(isNewerVersion("0.1.3", "0.1.3")).toBe(false);
    expect(isNewerVersion("0.1.2", "0.1.3")).toBe(false);
  });
});
