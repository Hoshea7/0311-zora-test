import { useEffect, useRef, useState } from "react";
import { useAtom, useSetAtom } from "jotai";
import { sidebarCollapsedAtom } from "../../store/ui";
import {
  createWorkspaceAtom,
  currentWorkspaceAtom,
  deleteWorkspaceAtom,
  loadWorkspacesAtom,
  startNewChatAtom,
  switchWorkspaceAtom,
  workspacesAtom,
} from "../../store/workspace";
import { cn } from "../../utils/cn";
import { getErrorMessage } from "../../utils/message";
import { SessionList } from "../sidebar/SessionList";
import { SidebarFooter } from "../sidebar/SidebarFooter";

export function LeftSidebar() {
  const [collapsed, setCollapsed] = useAtom(sidebarCollapsedAtom);
  const [workspaces] = useAtom(workspacesAtom);
  const [currentWorkspace] = useAtom(currentWorkspaceAtom);
  const loadWorkspaces = useSetAtom(loadWorkspacesAtom);
  const startNewChat = useSetAtom(startNewChatAtom);
  const switchWorkspace = useSetAtom(switchWorkspaceAtom);
  const createWorkspace = useSetAtom(createWorkspaceAtom);
  const deleteWorkspace = useSetAtom(deleteWorkspaceAtom);

  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [isSubmittingWorkspace, setIsSubmittingWorkspace] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadWorkspaces().catch((error) => {
      setWorkspaceError(getErrorMessage(error));
    });
  }, [loadWorkspaces]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsWorkspaceMenuOpen(false);
        setWorkspaceError(null);
      }
    };

    if (isWorkspaceMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isWorkspaceMenuOpen]);

  const toggleSidebar = () => {
    setCollapsed(!collapsed);
  };

  const resetWorkspaceForm = () => {
    setWorkspaceName("");
    setWorkspacePath("");
    setWorkspaceError(null);
    setIsCreateFormOpen(false);
  };

  const handleNewChat = () => {
    startNewChat();
  };

  const handleSwitchWorkspace = async (workspaceId: string) => {
    try {
      await switchWorkspace(workspaceId);
      setIsWorkspaceMenuOpen(false);
      setWorkspaceError(null);
    } catch (error) {
      setWorkspaceError(getErrorMessage(error));
    }
  };

  const handlePickWorkspaceDirectory = async () => {
    try {
      const selectedPath = await window.zora.pickWorkspaceDirectory();
      if (selectedPath) {
        setWorkspacePath(selectedPath);
        setWorkspaceError(null);
      }
    } catch (error) {
      setWorkspaceError(getErrorMessage(error));
    }
  };

  const handleCreateWorkspace = async () => {
    const nextName = workspaceName.trim();
    const nextPath = workspacePath.trim();

    if (!nextName || !nextPath) {
      setWorkspaceError("请先填写工作区名称并选择目录。");
      return;
    }

    setIsSubmittingWorkspace(true);

    try {
      await createWorkspace({ name: nextName, path: nextPath });
      resetWorkspaceForm();
      setIsWorkspaceMenuOpen(false);
    } catch (error) {
      setWorkspaceError(getErrorMessage(error));
    } finally {
      setIsSubmittingWorkspace(false);
    }
  };

  const handleDeleteWorkspace = async (
    workspaceId: string,
    workspaceNameToDelete: string
  ) => {
    if (
      !window.confirm(
        `确定删除工作区「${workspaceNameToDelete}」？该工作区下的本地会话数据也会被移除。`
      )
    ) {
      return;
    }

    try {
      await deleteWorkspace(workspaceId);
      setWorkspaceError(null);
    } catch (error) {
      setWorkspaceError(getErrorMessage(error));
    }
  };

  return (
    <aside
      className={cn(
        "titlebar-no-drag relative flex h-full flex-col overflow-hidden bg-[#f5f3f0] shadow-[2px_0_8px_rgba(0,0,0,0.04)] transition-all duration-300",
        collapsed ? "w-12" : "w-[280px]"
      )}
    >
      {!collapsed ? (
        <>
          <div className="border-b border-stone-200/60 px-4 pb-3 pt-[62px]">
            <div className="flex items-start justify-between gap-2">
              <div ref={menuRef} className="relative min-w-0 flex-1">
                <button
                  type="button"
                  className="w-full rounded-xl border border-stone-200/70 bg-white/75 px-3 py-2 text-left shadow-sm shadow-stone-900/5 transition hover:border-stone-300 hover:bg-white"
                  onClick={() =>
                    setIsWorkspaceMenuOpen((current) => !current)
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-600">
                        <svg
                          className="h-[18px] w-[18px]"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                          />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-stone-900">
                            {currentWorkspace?.name ?? "加载工作区..."}
                          </span>
                          {currentWorkspace?.id === "default" && (
                            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                              Default
                            </span>
                          )}
                        </div>
                        <div
                          className="mt-0.5 truncate text-[11px] text-stone-500"
                          title={currentWorkspace?.path}
                        >
                          {currentWorkspace?.path ?? "正在读取工作区目录..."}
                        </div>
                      </div>
                    </div>
                    <svg
                      className={cn(
                        "h-4 w-4 shrink-0 text-stone-400 transition-transform duration-200",
                        isWorkspaceMenuOpen && "rotate-180"
                      )}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </button>

                {isWorkspaceMenuOpen && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-stone-200/80 bg-[#fcfaf7] shadow-[0_18px_45px_rgba(41,37,36,0.16)]">
                    <div className="border-b border-stone-200/70 px-4 pb-3 pt-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-400">
                        工作区
                      </div>
                      <div className="mt-1 text-xs text-stone-500">
                        切换后会自动加载该工作区下的会话列表。
                      </div>
                    </div>

                    <div className="max-h-[260px] overflow-y-auto px-2 py-2">
                      {workspaces.map((workspace) => {
                        const isActive = workspace.id === currentWorkspace?.id;
                        const isDefaultWorkspace = workspace.id === "default";

                        return (
                          <div
                            key={workspace.id}
                            className={cn(
                              "group rounded-xl transition",
                              isActive
                                ? "bg-stone-900/[0.06]"
                                : "hover:bg-stone-900/[0.03]"
                            )}
                          >
                            <div className="flex items-center gap-2 px-2 py-2">
                              <button
                                type="button"
                                className="min-w-0 flex-1 text-left"
                                onClick={() => void handleSwitchWorkspace(workspace.id)}
                              >
                                <div className="flex items-center gap-2">
                                  <span
                                    className={cn(
                                      "truncate text-sm",
                                      isActive
                                        ? "font-medium text-stone-900"
                                        : "text-stone-700"
                                    )}
                                  >
                                    {workspace.name}
                                  </span>
                                  {isDefaultWorkspace && (
                                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-stone-500 shadow-sm">
                                      默认
                                    </span>
                                  )}
                                </div>
                                <div
                                  className="mt-1 truncate text-[11px] text-stone-500"
                                  title={workspace.path}
                                >
                                  {workspace.path}
                                </div>
                              </button>

                              <div className="flex shrink-0 items-center gap-1">
                                {isActive && (
                                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-stone-700 shadow-sm">
                                    <svg
                                      className="h-3.5 w-3.5"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2.5}
                                        d="M5 13l4 4L19 7"
                                      />
                                    </svg>
                                  </span>
                                )}

                                {!isDefaultWorkspace && (
                                  <button
                                    type="button"
                                    className="flex h-7 w-7 items-center justify-center rounded-full text-stone-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleDeleteWorkspace(
                                        workspace.id,
                                        workspace.name
                                      );
                                    }}
                                    aria-label={`删除工作区 ${workspace.name}`}
                                  >
                                    <svg
                                      className="h-3.5 w-3.5"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m-7 0h8"
                                      />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="border-t border-stone-200/70 bg-white/60 px-3 py-3">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-stone-700 transition hover:bg-stone-900/[0.04]"
                        onClick={() => {
                          setIsCreateFormOpen((current) => !current);
                          setWorkspaceError(null);
                        }}
                      >
                        <span className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-100 text-stone-600">
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 4v16m8-8H4"
                              />
                            </svg>
                          </span>
                          <span className="font-medium">新建工作区</span>
                        </span>
                        <svg
                          className={cn(
                            "h-4 w-4 text-stone-400 transition-transform duration-200",
                            isCreateFormOpen && "rotate-45"
                          )}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 4v16m8-8H4"
                          />
                        </svg>
                      </button>

                      {isCreateFormOpen && (
                        <div className="mt-3 space-y-3 rounded-2xl border border-stone-200/80 bg-[#fcfaf7] p-3">
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                              名称
                            </label>
                            <input
                              value={workspaceName}
                              onChange={(event) =>
                                setWorkspaceName(event.target.value)
                              }
                              placeholder="例如：客户端重构"
                              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-300"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                              目录
                            </label>
                            <button
                              type="button"
                              className="flex w-full items-center justify-between gap-3 rounded-xl border border-dashed border-stone-300 bg-white px-3 py-2 text-left text-sm text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                              onClick={() => void handlePickWorkspaceDirectory()}
                            >
                              <span className="min-w-0 flex-1 truncate">
                                {workspacePath || "选择工作目录"}
                              </span>
                              <span className="shrink-0 rounded-full bg-stone-100 px-2 py-1 text-[11px] font-medium text-stone-600">
                                浏览
                              </span>
                            </button>
                          </div>

                          {workspaceError && (
                            <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
                              {workspaceError}
                            </div>
                          )}

                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              className="rounded-xl px-3 py-2 text-sm text-stone-500 transition hover:bg-stone-100 hover:text-stone-700"
                              onClick={resetWorkspaceForm}
                            >
                              取消
                            </button>
                            <button
                              type="button"
                              className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() => void handleCreateWorkspace()}
                              disabled={isSubmittingWorkspace}
                            >
                              {isSubmittingWorkspace ? "创建中..." : "创建并切换"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={toggleSidebar}
                className="mt-1 rounded-md p-1.5 text-stone-400 transition hover:bg-stone-200/50 hover:text-stone-600"
                title="折叠侧边栏"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <rect width="18" height="18" x="3" y="3" rx="2" strokeWidth={2} />
                  <path
                    d="M9 3v18"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between px-4 pb-2 pt-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                会话
              </h2>
              <p className="mt-1 text-[11px] text-stone-500">
                当前工作区的本地历史会话
              </p>
            </div>
            <button
              onClick={handleNewChat}
              className="rounded-md p-1.5 text-stone-500 transition hover:bg-stone-200/50 hover:text-stone-800"
              title="新建会话"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2">
            <SessionList />
          </div>

          <div className="border-stone-200/50 p-3">
            <SidebarFooter />
          </div>
        </>
      ) : (
        <div className="flex h-full flex-col justify-between py-4 pt-[62px]">
          <div className="flex flex-col items-center">
            <button
              onClick={toggleSidebar}
              className="rounded-md p-2 text-stone-400 transition hover:bg-stone-200/50 hover:text-stone-600"
              title={`展开侧边栏${currentWorkspace ? `（当前：${currentWorkspace.name}）` : ""}`}
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <rect width="18" height="18" x="3" y="3" rx="2" strokeWidth={2} />
                <path
                  d="M9 3v18"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <button
              onClick={handleNewChat}
              className="mt-2 rounded-md p-2 text-stone-500 transition hover:bg-stone-200/50 hover:text-stone-800"
              title="新建会话"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </button>
          </div>

          <button
            className="mb-2 rounded-md p-2 text-stone-400 transition hover:bg-stone-200/50 hover:text-stone-600"
            title={currentWorkspace?.path ?? "当前工作区"}
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
          </button>
        </div>
      )}
    </aside>
  );
}
