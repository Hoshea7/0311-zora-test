import { atom } from "jotai";

const SIDEBAR_WIDTH_STORAGE_KEY = "zora:sidebarWidth";

export const SIDEBAR_COLLAPSED_WIDTH = 72;
export const SIDEBAR_MIN_WIDTH = 292;
export const SIDEBAR_MAX_WIDTH = 520;
export const SIDEBAR_DEFAULT_WIDTH = 344;

function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}

function readStoredSidebarWidth(): number {
  if (typeof window === "undefined") {
    return SIDEBAR_DEFAULT_WIDTH;
  }

  const stored = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
  return Number.isFinite(stored)
    ? clampSidebarWidth(stored)
    : SIDEBAR_DEFAULT_WIDTH;
}

function persistSidebarWidth(width: number): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    SIDEBAR_WIDTH_STORAGE_KEY,
    String(clampSidebarWidth(width))
  );
}

/**
 * 侧边栏折叠状态
 */
export const sidebarCollapsedAtom = atom(false);

/**
 * 侧边栏展开宽度
 */
const sidebarWidthBaseAtom = atom(readStoredSidebarWidth());
export const sidebarWidthAtom = atom(
  (get) => get(sidebarWidthBaseAtom),
  (_get, set, width: number) => {
    const nextWidth = clampSidebarWidth(width);
    set(sidebarWidthBaseAtom, nextWidth);
    persistSidebarWidth(nextWidth);
  }
);

/**
 * 设置弹窗开关
 */
export const isSettingsOpenAtom = atom(false);

/**
 * 设置面板当前 Tab
 */
export const settingsTabAtom = atom<
  "provider" | "feishu" | "skills" | "memory" | "mcp" | "about"
>("provider");
