import { useAtomValue } from "jotai";
import { isSettingsOpenAtom } from "../../store/ui";
import { LeftSidebar } from "./LeftSidebar";
import { MainArea } from "./MainArea";
import { SettingsPanel } from "../settings/SettingsPanel";

/**
 * 应用根布局容器
 * 提供整体布局结构：左侧边栏 + 中间对话区域
 */
export function AppShell() {
  const isSettingsOpen = useAtomValue(isSettingsOpenAtom);

  return (
    <main className="h-screen overflow-hidden overscroll-none bg-[#f5f3f0] text-stone-900 relative">
      {/* macOS 拖动区域 - 顶部 50px，现在设为透明以允许下方内容透出 */}
      <div className="titlebar-drag-region fixed left-0 right-0 top-0 z-50 h-[50px] bg-transparent" style={{ pointerEvents: 'none' }} />

      {/* 主内容区域 */}
      <div className="relative z-40 flex h-full">
        <LeftSidebar />
        <div className="flex-1 bg-white relative min-w-0 h-full overflow-hidden">
          {isSettingsOpen ? <SettingsPanel /> : <MainArea />}
        </div>
      </div>
    </main>
  );
}
