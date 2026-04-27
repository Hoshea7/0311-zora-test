import { beforeEach, vi } from "vitest";
import { initReportFile } from "./step-reporter";

vi.mock("electron", () => ({
  app: {
    getPath: (name: string) => {
      const os = require("node:os") as typeof import("node:os");
      const path = require("node:path") as typeof import("node:path");

      if (name === "home") {
        return os.homedir();
      }

      if (name === "userData") {
        return path.join(os.homedir(), ".zora");
      }

      return os.tmpdir();
    },
    getAppPath: () => process.cwd(),
    getName: () => "ZoraAgent-Test",
    getVersion: () => "0.0.0-test",
    whenReady: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    once: vi.fn(),
    quit: vi.fn(),
    exit: vi.fn(),
    setAppUserModelId: vi.fn(),
    commandLine: {
      appendSwitch: vi.fn(),
    },
    dock: {
      setIcon: vi.fn(),
    },
    isPackaged: false,
  },
  BrowserWindow: Object.assign(vi.fn(), {
    getAllWindows: vi.fn(() => []),
  }),
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(async () => undefined),
  },
  nativeTheme: {
    shouldUseDarkColors: false,
    on: vi.fn(),
  },
}));

vi.mock("electron-store", () => ({
  default: class MockStore {
    private data = new Map<string, unknown>();

    get(key: string, defaultValue?: unknown) {
      return this.data.get(key) ?? defaultValue;
    }

    set(key: string, value: unknown) {
      this.data.set(key, value);
    }

    delete(key: string) {
      this.data.delete(key);
    }

    has(key: string) {
      return this.data.has(key);
    }

    clear() {
      this.data.clear();
    }
  },
}));

initReportFile();

beforeEach(() => {
  vi.clearAllMocks();
});
