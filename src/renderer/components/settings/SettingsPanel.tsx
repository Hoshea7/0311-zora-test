import { useEffect } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { loadSkillsAtom, skillsAtom } from "../../store/skill";
import { isSettingsOpenAtom } from "../../store/ui";

export function SettingsPanel() {
  const skills = useAtomValue(skillsAtom);
  const loadSkills = useSetAtom(loadSkillsAtom);
  const setSettingsOpen = useSetAtom(isSettingsOpenAtom);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  return (
    <div className="titlebar-no-drag flex h-full w-full flex-col bg-[#f5f3f0] overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-8 pt-[80px] pb-24">
        <header className="mb-10 flex items-center justify-between">
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-stone-900">设置</h1>
          <button
            onClick={() => setSettingsOpen(false)}
            className="rounded-full p-2 text-stone-400 hover:bg-stone-200/60 hover:text-stone-700 transition"
            title="关闭设置"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* Skills Section */}
        <section className="mb-10">
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="text-[13px] font-medium text-stone-500">Skills</h2>
            <button
              type="button"
              onClick={() => {
                void window.zora.openSkillsDir();
              }}
              className="group flex items-center gap-1.5 text-[13px] text-stone-500 transition hover:text-stone-800"
            >
              <svg className="h-3.5 w-3.5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <span>打开目录</span>
            </button>
          </div>
          <div className="overflow-hidden rounded-[16px] border border-stone-200 shadow-sm bg-white">
            {skills.length === 0 ? (
              <div className="px-5 py-4 text-[14px] text-stone-500">暂未发现可用 Skill</div>
            ) : (
              skills.map((skill, index) => (
                <div
                  key={skill.path}
                  className={[
                    "flex items-center justify-between px-5 py-4 transition hover:bg-stone-50",
                    index !== skills.length - 1 ? "border-b border-stone-100" : ""
                  ].join(" ")}
                >
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-medium text-stone-800">{skill.name}</div>
                    <div className="mt-0.5 text-[11px] uppercase tracking-wider text-stone-400">
                      {skill.dirName}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void window.zora.openSkillDir(skill.dirName);
                    }}
                    className="shrink-0 text-[13px] font-medium text-stone-500 transition hover:text-stone-900"
                  >
                    查看详情
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* MCP Section */}
        <section className="mb-10">
          <h2 className="mb-3 px-1 text-[13px] font-medium text-stone-500">MCP</h2>
          <div className="overflow-hidden rounded-[16px] border border-stone-200 shadow-sm bg-white">
            <div className="flex items-center justify-between px-5 py-4">
              <span className="text-[14px] text-stone-500">暂未配置 MCP</span>
              <button className="text-[13px] font-medium text-stone-400 cursor-not-allowed">
                配置
              </button>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
