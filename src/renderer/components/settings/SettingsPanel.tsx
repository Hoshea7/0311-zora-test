import { useEffect } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { loadSkillsAtom, skillsAtom } from "../../store/skill";
import { isSettingsOpenAtom } from "../../store/ui";

export function SettingsPanel() {
  const isOpen = useAtomValue(isSettingsOpenAtom);
  const skills = useAtomValue(skillsAtom);
  const setSettingsOpen = useSetAtom(isSettingsOpenAtom);
  const loadSkills = useSetAtom(loadSkillsAtom);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    void loadSkills();
  }, [isOpen, loadSkills]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettingsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, setSettingsOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="titlebar-no-drag fixed inset-0 z-[80] flex items-center justify-center bg-black/30 px-4 py-8 backdrop-blur-sm"
      onClick={() => setSettingsOpen(false)}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="设置"
        onClick={(event) => event.stopPropagation()}
        className="flex w-full max-w-[480px] flex-col overflow-hidden rounded-[var(--radius-card)] border border-stone-900/8 bg-[var(--container-bg)] shadow-[0_24px_80px_rgba(28,25,23,0.18)]"
      >
        <header className="flex items-center justify-between border-b border-stone-900/8 px-6 py-5">
          <div>
            <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-stone-900">设置</h2>
            <p className="mt-1 text-[12px] text-stone-500">查看当前已加载的 Skills 与扩展状态</p>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(false)}
            className="rounded-full p-2 text-stone-500 transition hover:bg-stone-900/5 hover:text-stone-800"
            aria-label="关闭设置"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12M18 6l-12 12" />
            </svg>
          </button>
        </header>

        <div className="space-y-6 overflow-y-auto px-6 py-6">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">Skills</h3>
              <span className="rounded-full bg-stone-900/5 px-2.5 py-1 text-[11px] font-medium text-stone-600">
                {skills.length} 已加载
              </span>
            </div>

            <div className="overflow-hidden rounded-[18px] border border-stone-900/8 bg-white/80">
              {skills.length === 0 ? (
                <div className="px-4 py-4 text-sm text-stone-500">暂未发现可用 Skill</div>
              ) : (
                skills.map((skill, index) => (
                  <div
                    key={skill.path}
                    className={[
                      "flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-stone-900/[0.03]",
                      index !== skills.length - 1 ? "border-b border-stone-900/6" : ""
                    ].join(" ")}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-stone-900">{skill.name}</div>
                      <div className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-stone-400">
                        {skill.dirName}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void window.zora.openSkillDir(skill.dirName);
                      }}
                      className="shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium text-stone-600 transition hover:bg-stone-900/6 hover:text-stone-900"
                    >
                      查看
                    </button>
                  </div>
                ))
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                void window.zora.openSkillsDir();
              }}
              className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-[13px] font-medium text-stone-700 transition hover:bg-stone-900/5 hover:text-stone-900"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <span>打开 Skills 目录</span>
            </button>
          </section>

          <section className="space-y-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">MCP</h3>
            <div className="rounded-[18px] border border-dashed border-stone-900/10 bg-white/50 px-4 py-4 text-sm text-stone-500">
              暂未配置
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
