import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

export interface TestZoraHome {
  /** 临时 HOME 目录路径 */
  homeDir: string;
  /** 临时 ~/.zora 目录路径 */
  path: string;
  /** sessions 子目录 */
  sessionsDir: string;
  /** memory 子目录 */
  memoryDir: string;
  /** 清理临时目录 */
  cleanup: () => void;
}

/**
 * 创建一个临时的 Zora home 目录，结构模拟 ~/.zora。
 */
export function createTestZoraHome(): TestZoraHome {
  const homesRoot = join(process.cwd(), "tests", ".artifacts", "live", "homes");
  const homeDir = join(homesRoot, `zora-live-test-${randomUUID()}`);
  const path = join(homeDir, ".zora");
  const sessionsDir = join(path, "workspaces", "default", "sessions");
  const memoryDir = join(path, "zoras", "default", "memory");

  mkdirSync(homesRoot, { recursive: true });
  mkdirSync(sessionsDir, { recursive: true });
  mkdirSync(memoryDir, { recursive: true });

  return {
    homeDir,
    path,
    sessionsDir,
    memoryDir,
    cleanup: () => {
      if (existsSync(homeDir)) {
        rmSync(homeDir, { recursive: true, force: true });
      }
    },
  };
}
