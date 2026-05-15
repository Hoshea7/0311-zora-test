import { atom } from "jotai";

export type MainView = "chat" | "schedule" | "settings";

/**
 * 侧边栏折叠状态
 */
export const sidebarCollapsedAtom = atom(false);

/**
 * 侧边栏展开宽度
 */
export const sidebarWidthAtom = atom(292);

/**
 * 主内容区当前视图
 */
export const activeMainViewAtom = atom<MainView>("chat");

/**
 * 设置页开关
 *
 * 兼容既有设置入口：打开设置切到 settings，关闭设置回到 chat。
 */
export const isSettingsOpenAtom = atom(
  (get) => get(activeMainViewAtom) === "settings",
  (_get, set, isOpen: boolean) => {
    set(activeMainViewAtom, isOpen ? "settings" : "chat");
  }
);

/**
 * 设置面板当前 Tab
 */
export const settingsTabAtom = atom<
  "provider" | "feishu" | "skills" | "memory" | "mcp" | "about"
>("provider");
