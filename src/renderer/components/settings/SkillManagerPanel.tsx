import { useCallback, useEffect, useState, useMemo } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import type { SkillMeta } from "../../../shared/zora";
import type {
  DiscoveredSkill,
  DiscoveryResult,
  ImportMethod,
} from "../../../shared/types/skill";
import { loadSkillsAtom, skillsAtom } from "../../store/skill";
import { cn } from "../../utils/cn";
import { getErrorMessage } from "../../utils/message";
import { Button } from "../ui/Button";

type TabId = "installed" | "discover";
type Notice = { tone: "error" | "success"; message: string } | null;

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M3.75 7.5a1.5 1.5 0 011.5-1.5h4.01a1.5 1.5 0 011.11.49l.9 1.01h7.48a1.5 1.5 0 011.5 1.5v7.5a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-9z"
      />
    </svg>
  );
}

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M13 3l-1.8 4.6L6.6 9.4l4.6 1.8L13 16l1.8-4.8 4.6-1.8-4.6-1.8L13 3z"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

function NoticeBanner({ notice }: { notice: Notice }) {
  if (!notice) {
    return null;
  }

  return (
    <div
      className={cn(
        "mb-5 rounded-2xl border px-4 py-3 text-[13px] shadow-sm",
        notice.tone === "success"
          ? "border-emerald-200 bg-emerald-50/80 text-emerald-700"
          : "border-rose-200 bg-rose-50/80 text-rose-700"
      )}
    >
      {notice.message}
    </div>
  );
}

function InstalledSkillCard({
  skill,
  uninstalling,
  onUninstall,
  onOpenDir,
}: {
  skill: SkillMeta;
  uninstalling: boolean;
  onUninstall: (dirName: string) => void;
  onOpenDir: (dirName: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <article className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-stone-50/70 group">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-[14px] font-semibold text-stone-900">
            {skill.name}
          </h3>
        </div>
        <p className="mt-1 truncate text-[13px] leading-relaxed text-stone-500">
          {skill.description}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onOpenDir(skill.dirName)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 transition hover:border-stone-300 hover:bg-stone-100 hover:text-stone-900"
          title="打开技能目录"
        >
          <FolderIcon className="h-4 w-4" />
        </button>

        {confirming ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={uninstalling}
              onClick={() => {
                onUninstall(skill.dirName);
                setConfirming(false);
              }}
              className="rounded-full bg-rose-500 px-3 py-1.5 text-[12px] font-medium text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50 shadow-sm"
            >
              Confirm
            </button>
            <button
              type="button"
              disabled={uninstalling}
              onClick={() => setConfirming(false)}
              className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[12px] font-medium text-stone-600 transition hover:bg-stone-50 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              取消
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={uninstalling}
            onClick={() => setConfirming(true)}
            className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[12px] font-medium text-stone-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uninstalling ? "卸载中..." : "卸载"}
          </button>
        )}
      </div>
    </article>
  );
}

function InstalledTab({
  skills,
  loading,
  uninstallingDirName,
  onRefresh,
  onUninstall,
  onOpenDir,
  onOpenSkillsDir,
}: {
  skills: SkillMeta[];
  loading: boolean;
  uninstallingDirName: string | null;
  onRefresh: () => void;
  onUninstall: (dirName: string) => void;
  onOpenDir: (dirName: string) => void;
  onOpenSkillsDir: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-[18px] border-none bg-stone-50/50 shadow-[0_2px_12px_rgba(0,0,0,0.03)] ring-1 ring-stone-900/5 px-4 py-4 shadow-sm shadow-stone-950/5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-stone-500">
            已安装
          </p>
          <p className="mt-1 text-[14px] text-stone-600">
            共 {skills.length} 个可用技能。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={onOpenSkillsDir}>
            打开目录
          </Button>
          <Button variant="secondary" size="sm" onClick={onRefresh} disabled={loading}>
            {loading ? "加载中..." : "刷新"}
          </Button>
        </div>
      </div>

      {skills.length === 0 && !loading ? (
        <div className="rounded-[22px] border border-dashed border-stone-300 bg-stone-50/70 px-8 py-12 text-center shadow-sm shadow-stone-950/5">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-stone-200">
            <SparkIcon className="h-6 w-6 text-stone-500" />
          </div>
          <h3 className="mt-5 text-[16px] font-semibold text-stone-900">
            暂无已安装的技能
          </h3>
          <p className="mx-auto mt-2 max-w-lg text-[13px] leading-6 text-stone-500">
            点击“发现”从其他工具导入，或直接让 Zora 为您安装新技能。
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {skills.map((skill) => (
            <InstalledSkillCard
              key={skill.dirName}
              skill={skill}
              uninstalling={uninstallingDirName === skill.dirName}
              onUninstall={onUninstall}
              onOpenDir={onOpenDir}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function importKeyFor(skill: DiscoveredSkill) {
  return `${skill.sourceTool}:${skill.dirName}`;
}

function DiscoverSkillCard({
  skill,
  toolName,
  importing,
  onImport,
}: {
  skill: DiscoveredSkill;
  toolName: string;
  importing: boolean;
  onImport: (skill: DiscoveredSkill, method: ImportMethod) => void;
}) {
  const [showMethodPicker, setShowMethodPicker] = useState(false);

  if (skill.alreadyInZora) {
    return (
      <article className="flex items-center justify-between gap-4 px-4 py-3 bg-stone-50/30">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[14px] font-medium text-stone-500">
              {skill.name}
            </h3>
            <span className="shrink-0 rounded bg-stone-100/80 px-1.5 py-0.5 font-sans text-[10px] font-medium tracking-wide text-stone-400">
              {toolName}
            </span>
          </div>
          <p className="mt-1 truncate text-[13px] leading-relaxed text-stone-400">
            {skill.description}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-stone-400">
          <CheckIcon className="h-4 w-4" />
          <span className="text-[12px]">已导入</span>
        </div>
      </article>
    );
  }

  return (
    <article className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-stone-50/70">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-[14px] font-semibold text-stone-900">
            {skill.name}
          </h3>
          <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 font-sans text-[10px] font-medium tracking-wide text-stone-500">
            {toolName}
          </span>
        </div>
        <p className="mt-1 truncate text-[13px] leading-relaxed text-stone-500">
          {skill.description}
        </p>
      </div>

      {showMethodPicker ? (
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={importing}
            onClick={() => {
              onImport(skill, "symlink");
              setShowMethodPicker(false);
            }}
            className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[12px] font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
            title="软链接导入，保持与源文件同步"
          >
            软链接导入
          </button>
          <button
            type="button"
            disabled={importing}
            onClick={() => {
              onImport(skill, "copy");
              setShowMethodPicker(false);
            }}
            className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[12px] font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
            title="复制导入，作为独立副本"
          >
            复制导入
          </button>
          <button
            type="button"
            onClick={() => setShowMethodPicker(false)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
            title="取消"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          disabled={importing}
          onClick={() => setShowMethodPicker(true)}
          className="shrink-0 bg-white shadow-sm"
        >
          {importing ? "导入中..." : "导入"}
        </Button>
      )}
    </article>
  );
}

function DiscoverTab({
  result,
  loading,
  importingSet,
  onScan,
  onImport,
}: {
  result: DiscoveryResult | null;
  loading: boolean;
  importingSet: Set<string>;
  onScan: () => void;
  onImport: (skill: DiscoveredSkill, method: ImportMethod) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showImported, setShowImported] = useState(false);

  const allSkills = useMemo(() => {
    if (!result) return [];
    return result.tools
      .filter((t) => t.exists)
      .flatMap((t) => t.skills.map((s) => ({ skill: s, toolName: t.tool.name })));
  }, [result]);

  const filteredSkills = useMemo(() => {
    return allSkills.filter(
      ({ skill }) =>
        skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        skill.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [allSkills, searchQuery]);

  const newSkills = filteredSkills.filter(({ skill }) => !skill.alreadyInZora);
  const importedSkills = filteredSkills.filter(({ skill }) => skill.alreadyInZora);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-[16px] border-none bg-stone-50/50 px-4 py-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)] ring-1 ring-stone-900/5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-stone-500">
            发现技能
          </p>
          <p className="mt-1 text-[13px] text-stone-600">
            {result
              ? `找到 ${result.totalNew} 个可导入技能`
              : "扫描本机支持的 AI 工具以查找技能"}
          </p>
        </div>

        <Button variant="primary" size="sm" onClick={onScan} disabled={loading}>
          {loading ? "扫描中..." : "重新扫描"}
        </Button>
      </div>

      {result && allSkills.length > 0 && (
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <SearchIcon className="h-4 w-4 text-stone-400" />
          </div>
          <input
            type="search"
            placeholder="搜索技能..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-[10px] border border-stone-200 bg-white py-2 pl-9 pr-3 text-[13px] outline-none placeholder:text-stone-400 focus:border-stone-300 focus:ring-1 focus:ring-stone-300 shadow-sm"
          />
        </div>
      )}

      {result ? (
        allSkills.length > 0 ? (
          <div className="space-y-6">
            {/* 未导入的新技能 */}
            {newSkills.length > 0 ? (
              <div className="divide-y divide-stone-100/80 border-none rounded-[16px] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.03)] ring-1 ring-stone-900/5 overflow-hidden">
                {newSkills.map(({ skill, toolName }) => (
                  <DiscoverSkillCard
                    key={importKeyFor(skill)}
                    skill={skill}
                    toolName={toolName}
                    importing={importingSet.has(importKeyFor(skill))}
                    onImport={onImport}
                  />
                ))}
              </div>
            ) : searchQuery ? (
              <div className="rounded-xl border border-stone-200 bg-white py-12 text-center shadow-sm">
                <p className="text-[13px] text-stone-500">未找到未导入的新技能</p>
              </div>
            ) : null}

            {/* 已导入的重复技能 (折叠面板) */}
            {importedSkills.length > 0 && (
              <div className="space-y-3">
                <button
                  onClick={() => setShowImported(!showImported)}
                  className="flex items-center gap-1.5 text-[13px] font-medium text-stone-500 hover:text-stone-800 transition-colors"
                >
                  <svg
                    className={cn("h-4 w-4 transition-transform duration-200", showImported ? "rotate-90" : "")}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  发现 {importedSkills.length} 个已导入的重复技能
                </button>
                
                {showImported && (
                  <div className="divide-y divide-stone-100/80 border-none rounded-[16px] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.03)] ring-1 ring-stone-900/5 overflow-hidden">
                    {importedSkills.map(({ skill, toolName }) => (
                      <DiscoverSkillCard
                        key={importKeyFor(skill)}
                        skill={skill}
                        toolName={toolName}
                        importing={false}
                        onImport={onImport}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-[22px] border border-dashed border-stone-300 bg-stone-50/70 px-8 py-12 text-center shadow-sm shadow-stone-950/5">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-stone-200">
              <FolderIcon className="h-6 w-6 text-stone-500" />
            </div>
            <h3 className="mt-5 text-[15px] font-semibold text-stone-900">
              未发现可导入的技能
            </h3>
            <p className="mx-auto mt-2 max-w-lg text-[13px] leading-relaxed text-stone-500">
              请先在 Claude Code 等工具中安装技能后重试。
            </p>
          </div>
        )
      ) : (
        <div className="rounded-[22px] border border-dashed border-stone-300 bg-stone-50/70 px-8 py-12 text-center shadow-sm shadow-stone-950/5">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-stone-200">
            <SparkIcon className="h-6 w-6 text-stone-500" />
          </div>
          <h3 className="mt-5 text-[15px] font-semibold text-stone-900">
            准备扫描
          </h3>
          <p className="mx-auto mt-2 max-w-lg text-[13px] leading-relaxed text-stone-500">
            Zora 可以自动发现本机其他 AI 工具中的技能并导入。
          </p>
        </div>
      )}
    </div>
  );
}

export function SkillManagerPanel() {
  const skills = useAtomValue(skillsAtom);
  const loadSkills = useSetAtom(loadSkillsAtom);

  const [tab, setTab] = useState<TabId>("installed");
  const [loadingInstalled, setLoadingInstalled] = useState(true);
  const [discoveryResult, setDiscoveryResult] = useState<DiscoveryResult | null>(null);
  const [loadingDiscovery, setLoadingDiscovery] = useState(false);
  const [uninstallingDirName, setUninstallingDirName] = useState<string | null>(null);
  const [importingSet, setImportingSet] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<Notice>(null);

  const refreshInstalled = useCallback(async () => {
    setLoadingInstalled(true);
    try {
      await loadSkills();
    } catch (error) {
      setNotice({ tone: "error", message: getErrorMessage(error) });
    } finally {
      setLoadingInstalled(false);
    }
  }, [loadSkills]);

  useEffect(() => {
    void refreshInstalled();
  }, [refreshInstalled]);

  const handleScan = useCallback(async () => {
    setLoadingDiscovery(true);
    try {
      const result = await window.zora.discoverSkills();
      setDiscoveryResult(result);
    } catch (error) {
      setNotice({ tone: "error", message: getErrorMessage(error) });
    } finally {
      setLoadingDiscovery(false);
    }
  }, []);

  const handleOpenDir = useCallback(async (dirName: string) => {
    try {
      await window.zora.openSkillDir(dirName);
    } catch (error) {
      setNotice({ tone: "error", message: getErrorMessage(error) });
    }
  }, []);

  const handleOpenSkillsDir = useCallback(async () => {
    try {
      await window.zora.openSkillsDir();
    } catch (error) {
      setNotice({ tone: "error", message: getErrorMessage(error) });
    }
  }, []);

  const handleUninstall = useCallback(
    async (dirName: string) => {
      setUninstallingDirName(dirName);
      setNotice(null);

      try {
        await window.zora.uninstallSkill(dirName);
        await refreshInstalled();
        if (discoveryResult) {
          await handleScan();
        }
        setNotice({ tone: "success", message: `已卸载 "${dirName}"。` });
      } catch (error) {
        setNotice({ tone: "error", message: getErrorMessage(error) });
      } finally {
        setUninstallingDirName(null);
      }
    },
    [discoveryResult, handleScan, refreshInstalled]
  );

  const handleImport = useCallback(
    async (skill: DiscoveredSkill, method: ImportMethod) => {
      const key = importKeyFor(skill);
      setImportingSet((current) => new Set(current).add(key));
      setNotice(null);

      try {
        const result = await window.zora.importSkill(
          skill.sourcePath,
          method,
          skill.sourceTool,
          skill.dirName
        );

        if (!result.success) {
          setNotice({
            tone: "error",
            message: result.error ?? `导入 "${skill.name}" 失败。`,
          });
          return;
        }

        await refreshInstalled();
        await handleScan();
        setNotice({
          tone: "success",
          message: `已通过 ${method} 导入 "${skill.name}"。`,
        });
      } catch (error) {
        setNotice({ tone: "error", message: getErrorMessage(error) });
      } finally {
        setImportingSet((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
    },
    [handleScan, refreshInstalled]
  );

  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-6 flex flex-col gap-1.5 border-b border-stone-100 pb-5">
        <h2 className="text-[28px] font-bold tracking-tight text-stone-900">
          技能管理
        </h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-stone-400">
          管理 Zora 可用的扩展技能。您可以在此卸载不需要的技能，或从其他 AI 工具发现并导入新技能。
        </p>
      </div>

      <div className="mb-5 inline-flex rounded-[14px] border-none bg-stone-100/50 p-1 shadow-none">
        <button
          type="button"
          onClick={() => setTab("installed")}
          className={cn(
            "rounded-[14px] px-4 py-2 text-[13px] font-medium transition",
            tab === "installed"
              ? "bg-white text-stone-900 shadow-sm ring-1 ring-stone-200"
              : "text-stone-500 hover:text-stone-800"
          )}
        >
          已安装
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("discover");
            if (!discoveryResult && !loadingDiscovery) {
              void handleScan();
            }
          }}
          className={cn(
            "rounded-[14px] px-4 py-2 text-[13px] font-medium transition",
            tab === "discover"
              ? "bg-white text-stone-900 shadow-sm ring-1 ring-stone-200"
              : "text-stone-500 hover:text-stone-800"
          )}
        >
          发现
        </button>
      </div>

      <NoticeBanner notice={notice} />

      {tab === "installed" ? (
        <InstalledTab
          skills={skills}
          loading={loadingInstalled}
          uninstallingDirName={uninstallingDirName}
          onRefresh={() => {
            void refreshInstalled();
          }}
          onUninstall={(dirName) => {
            void handleUninstall(dirName);
          }}
          onOpenDir={(dirName) => {
            void handleOpenDir(dirName);
          }}
          onOpenSkillsDir={() => {
            void handleOpenSkillsDir();
          }}
        />
      ) : (
        <DiscoverTab
          result={discoveryResult}
          loading={loadingDiscovery}
          importingSet={importingSet}
          onScan={() => {
            void handleScan();
          }}
          onImport={(skill, method) => {
            void handleImport(skill, method);
          }}
        />
      )}
    </section>
  );
}
