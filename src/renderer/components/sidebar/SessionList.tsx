import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { runningSessionsAtom } from "../../store/chat";
import {
  pendingAskUsersBySessionAtom,
  pendingPermissionsBySessionAtom,
} from "../../store/hitl";
import { isSettingsOpenAtom } from "../../store/ui";
import {
  DEFAULT_WORKSPACE_ID,
  currentSessionIdAtom,
  currentWorkspaceIdAtom,
  deleteSessionAtom,
  deleteWorkspaceAtom,
  pinnedWorkspaceIdsAtom,
  pinnedSessionIdsAtom,
  renameWorkspaceAtom,
  renameSessionAtom,
  startNewChatInWorkspaceAtom,
  switchWorkspaceSessionAtom,
  togglePinSessionAtom,
  togglePinWorkspaceAtom,
  workspaceSessionGroupsAtom,
} from "../../store/workspace";
import { cn } from "../../utils/cn";
import type { Session, Workspace } from "../../types";

type SessionStatus = "needs-input" | "running" | "current" | "idle";

interface SessionListProps {
  searchQuery?: string;
}

interface WorkspaceGroupView {
  workspace: Workspace;
  sessions: Session[];
  loaded: boolean;
  status: SessionStatus;
}

const PATH_PREVIEW_DELAY_MS = 520;

function FolderIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={cn(
        "h-4 w-4 shrink-0",
        expanded ? "text-stone-700" : "text-stone-500"
      )}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      {expanded ? (
        <>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M3.75 8.5V7.75A2.25 2.25 0 016 5.5h3.05c.55 0 1.08.2 1.49.56l1.1.96c.41.36.94.56 1.49.56H17.5c1.1 0 2 .9 2 2v.67"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M4.25 9.75h15.1c.96 0 1.68.9 1.46 1.83l-1.18 4.9a2.5 2.5 0 01-2.43 1.92H6.1a2.5 2.5 0 01-2.44-3.06l.95-4.05a2 2 0 011.95-1.54z"
          />
        </>
      ) : (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.9}
          d="M3.75 7.5A2.25 2.25 0 016 5.25h3.4c.55 0 1.08.2 1.49.56l1.22 1.08c.41.36.94.56 1.49.56H18A2.25 2.25 0 0120.25 9.7v6.8A2.25 2.25 0 0118 18.75H6a2.25 2.25 0 01-2.25-2.25v-9z"
        />
      )}
    </svg>
  );
}

function StatusDot({ status }: { status: SessionStatus }) {
  if (status === "needs-input") {
    return (
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400/55 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
      </span>
    );
  }

  if (status === "running") {
    return (
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400/60 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-orange-500" />
      </span>
    );
  }

  if (status === "current") {
    return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />;
  }

  return (
    <span className="h-1.5 w-1.5 shrink-0 rounded-full border border-stone-300/90 bg-transparent" />
  );
}

function WorkspaceBadge({ status }: { status: SessionStatus }) {
  if (status === "needs-input") {
    return (
      <span className="flex shrink-0 justify-end">
        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-600 ring-1 ring-rose-100">
          待确认
        </span>
      </span>
    );
  }

  if (status === "running") {
    return (
      <span className="flex shrink-0 justify-end">
        <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-600 ring-1 ring-orange-100">
          运行中
        </span>
      </span>
    );
  }

  return null;
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.9}
        d="M14.25 4.75l5 5-2.7 2.7.35 4.85-1.1 1.1-4.25-4.25-4.3 4.3-1.7-1.7 4.3-4.3L5.6 8.2l1.1-1.1 4.85.35 2.7-2.7z"
      />
    </svg>
  );
}

function RenameIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.9}
        d="M4.5 19.5h15M6.25 15.75l.7-3.5 8.3-8.3a1.77 1.77 0 012.5 0l.3.3a1.77 1.77 0 010 2.5l-8.3 8.3-3.5.7z"
      />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.9}
        d="M5.75 7.25h12.5M9.75 7.25V5.5c0-.7.55-1.25 1.25-1.25h2c.7 0 1.25.55 1.25 1.25v1.75m2.5 0l-.7 10.2a2 2 0 01-2 1.86h-4.1a2 2 0 01-2-1.86l-.7-10.2"
      />
    </svg>
  );
}

function formatSessionTime(value: string): string {
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return "";
  }

  const diffMs = Math.max(0, Date.now() - timestamp);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return "刚刚";
  }

  if (diffMs < hour) {
    return `${Math.floor(diffMs / minute)} 分钟`;
  }

  if (diffMs < day) {
    return `${Math.floor(diffMs / hour)} 小时`;
  }

  if (diffMs < 7 * day) {
    return `${Math.floor(diffMs / day)} 天`;
  }

  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}

function getSessionStatus(
  sessionId: string,
  currentSessionId: string | null,
  runningSessions: Set<string>,
  pendingPermissionsBySession: Record<string, unknown[]>,
  pendingAskUsersBySession: Record<string, unknown[]>
): SessionStatus {
  if (
    (pendingPermissionsBySession[sessionId]?.length ?? 0) > 0 ||
    (pendingAskUsersBySession[sessionId]?.length ?? 0) > 0
  ) {
    return "needs-input";
  }

  if (runningSessions.has(sessionId)) {
    return "running";
  }

  if (currentSessionId === sessionId) {
    return "current";
  }

  return "idle";
}

function getWorkspaceStatus(
  sessions: Session[],
  currentSessionId: string | null,
  runningSessions: Set<string>,
  pendingPermissionsBySession: Record<string, unknown[]>,
  pendingAskUsersBySession: Record<string, unknown[]>
): SessionStatus {
  let hasCurrent = false;
  let hasRunning = false;

  for (const session of sessions) {
    const status = getSessionStatus(
      session.id,
      currentSessionId,
      runningSessions,
      pendingPermissionsBySession,
      pendingAskUsersBySession
    );

    if (status === "needs-input") {
      return "needs-input";
    }

    if (status === "running") {
      hasRunning = true;
    }

    if (status === "current") {
      hasCurrent = true;
    }
  }

  if (hasRunning) {
    return "running";
  }

  if (hasCurrent) {
    return "current";
  }

  return "idle";
}

function matchesQuery(workspace: Workspace, session: Session, query: string) {
  if (!query) {
    return true;
  }

  return (
    workspace.name.toLowerCase().includes(query) ||
    session.title.toLowerCase().includes(query)
  );
}

function SessionRow({
  session,
  workspaceId,
  status,
  isActive,
  onSwitch,
}: {
  session: Session;
  workspaceId: string;
  status: SessionStatus;
  isActive: boolean;
  onSwitch: (workspaceId: string, sessionId: string) => void;
}) {
  const deleteSession = useSetAtom(deleteSessionAtom);
  const renameSession = useSetAtom(renameSessionAtom);
  const togglePinSession = useSetAtom(togglePinSessionAtom);
  const pinnedSessionIds = useAtomValue(pinnedSessionIdsAtom);
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const isPinned = pinnedSessionIds.has(session.id);

  const handleRenameSubmit = () => {
    const trimmed = renameValue.trim();

    if (trimmed.length > 0 && trimmed !== session.title) {
      renameSession({
        sessionId: session.id,
        title: trimmed,
        workspaceId,
      });
    }

    setRenaming(false);
    setRenameValue("");
  };

  const handleDelete = () => {
    setMenuOpen(false);

    if (window.confirm(`确定删除会话「${session.title}」？此操作不可撤销。`)) {
      deleteSession(session.id, workspaceId);
    }
  };

  return (
    <div
      role="button"
      tabIndex={renaming ? -1 : 0}
      className={cn(
        "group/session relative flex min-h-[30px] cursor-pointer items-center gap-2 rounded-[8px] border px-2 py-1.5 text-left transition-colors",
        "outline-none focus-visible:ring-2 focus-visible:ring-stone-900/10",
        isActive
          ? "border-transparent bg-white/65"
          : "border-transparent hover:bg-white/50"
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => {
        if (!renaming) {
          onSwitch(workspaceId, session.id);
        }
      }}
      onKeyDown={(event) => {
        if (renaming) {
          return;
        }

        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSwitch(workspaceId, session.id);
        }
      }}
    >
      <StatusDot status={status} />

      <div className="min-w-0 flex-1">
        {renaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onFocus={(event) => event.currentTarget.select()}
            onBlur={handleRenameSubmit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleRenameSubmit();
              }

              if (event.key === "Escape") {
                event.preventDefault();
                setRenaming(false);
                setRenameValue("");
              }
            }}
            className="h-7 w-full rounded-md bg-white px-2 text-[13px] text-stone-900 outline-none ring-1 ring-inset ring-stone-200 focus:ring-2 focus:ring-stone-900/10"
          />
        ) : (
          <div className="flex min-w-0 items-center gap-1.5" title={session.title}>
            {isPinned ? (
              <PinIcon className="h-3 w-3 shrink-0 text-stone-400" />
            ) : null}
            <span
              className={cn(
                "min-w-0 truncate text-[13.5px] leading-5",
                isActive
                  ? "font-medium text-stone-900"
                  : "font-normal text-stone-700 group-hover/session:text-stone-950"
              )}
            >
              {session.title}
            </span>
          </div>
        )}
      </div>

      {!renaming ? (
        <div
          className="relative h-6 w-[52px] shrink-0"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <span
            className={cn(
              "absolute right-0 top-1/2 -translate-y-1/2 text-right text-[11px] text-stone-400 transition-opacity",
              hovered || menuOpen ? "opacity-0" : "opacity-100"
            )}
          >
            {status === "running"
              ? "运行中"
              : status === "needs-input"
                ? "待确认"
                : formatSessionTime(session.updatedAt)}
          </span>

          <DropdownMenu.Root
            open={menuOpen}
            onOpenChange={(open) => setMenuOpen(open)}
          >
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className={cn(
                  "absolute right-0 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-stone-400 opacity-0 transition",
                  "hover:bg-stone-900/[0.05] hover:text-stone-700",
                  "focus-visible:opacity-100 focus-visible:outline-none",
                  (hovered || menuOpen) && "opacity-100",
                  menuOpen && "bg-white text-stone-800 ring-1 ring-stone-200/70"
                )}
                aria-label={`打开${session.title}的操作菜单`}
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 12h.01M12 12h.01M19 12h.01"
                  />
                </svg>
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={4}
                className={cn(
                  "z-50 w-[128px] overflow-hidden rounded-[10px]",
                  "bg-white/95",
                  "ring-1 ring-stone-200/90 shadow-[0_8px_18px_rgba(41,37,36,0.10)]",
                  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
                )}
              >
                <div className="px-0.5 py-0.5">
                  <DropdownMenu.Item
                    className="flex w-full cursor-pointer items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[13px] text-stone-700 transition-colors focus:bg-stone-900/[0.04] focus:outline-none data-[highlighted]:bg-stone-900/[0.04]"
                    onSelect={() => togglePinSession(session.id)}
                  >
                    <PinIcon className="h-3.5 w-3.5 shrink-0 text-stone-500" />
                    <span>{isPinned ? "取消置顶" : "置顶"}</span>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className="mt-0.5 flex w-full cursor-pointer items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[13px] text-stone-700 transition-colors focus:bg-stone-900/[0.04] focus:outline-none data-[highlighted]:bg-stone-900/[0.04]"
                    onSelect={() => {
                      setRenameValue(session.title);
                      setRenaming(true);
                    }}
                  >
                    <RenameIcon className="h-3.5 w-3.5 shrink-0 text-stone-500" />
                    <span>重命名</span>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className="mt-0.5 flex w-full cursor-pointer items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[13px] text-red-700 transition-colors focus:bg-red-50 focus:outline-none data-[highlighted]:bg-red-50"
                    onSelect={handleDelete}
                  >
                    <TrashIcon className="h-3.5 w-3.5 shrink-0 text-red-500" />
                    <span>删除</span>
                  </DropdownMenu.Item>
                </div>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      ) : null}
    </div>
  );
}

export function SessionList({ searchQuery = "" }: SessionListProps) {
  const groups = useAtomValue(workspaceSessionGroupsAtom);
  const currentWorkspaceId = useAtomValue(currentWorkspaceIdAtom);
  const currentSessionId = useAtomValue(currentSessionIdAtom);
  const runningSessions = useAtomValue(runningSessionsAtom);
  const pendingPermissionsBySession = useAtomValue(pendingPermissionsBySessionAtom);
  const pendingAskUsersBySession = useAtomValue(pendingAskUsersBySessionAtom);
  const isSettingsOpen = useAtomValue(isSettingsOpenAtom);
  const pinnedWorkspaceIds = useAtomValue(pinnedWorkspaceIdsAtom);
  const switchWorkspaceSession = useSetAtom(switchWorkspaceSessionAtom);
  const startNewChatInWorkspace = useSetAtom(startNewChatInWorkspaceAtom);
  const deleteWorkspace = useSetAtom(deleteWorkspaceAtom);
  const renameWorkspace = useSetAtom(renameWorkspaceAtom);
  const togglePinWorkspace = useSetAtom(togglePinWorkspaceAtom);
  const setSettingsOpen = useSetAtom(isSettingsOpenAtom);
  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState<Set<string>>(
    new Set()
  );
  const [showAllWorkspaceIds, setShowAllWorkspaceIds] = useState<Set<string>>(
    new Set()
  );
  const [workspaceMenuOpenId, setWorkspaceMenuOpenId] = useState<string | null>(
    null
  );
  const [renamingWorkspaceId, setRenamingWorkspaceId] = useState<string | null>(
    null
  );
  const [workspaceRenameValue, setWorkspaceRenameValue] = useState("");
  const [pathPreviewWorkspaceId, setPathPreviewWorkspaceId] = useState<
    string | null
  >(null);
  const [workspaceActionError, setWorkspaceActionError] = useState<string | null>(
    null
  );
  const pathPreviewTimerRef = useRef<number | null>(null);
  const workspaceActionErrorTimerRef = useRef<number | null>(null);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const groupViews = useMemo<WorkspaceGroupView[]>(() => {
    return groups.flatMap((group) => {
      const workspaceMatches =
        normalizedSearchQuery.length > 0 &&
        group.workspace.name.toLowerCase().includes(normalizedSearchQuery);
      const sessions = normalizedSearchQuery
        ? group.sessions.filter((session) =>
            matchesQuery(group.workspace, session, normalizedSearchQuery)
          )
        : group.sessions;

      if (normalizedSearchQuery && !workspaceMatches && sessions.length === 0) {
        return [];
      }

      return [
        {
          workspace: group.workspace,
          sessions: workspaceMatches ? group.sessions : sessions,
          loaded: group.loaded,
          status: getWorkspaceStatus(
            group.sessions,
            currentSessionId,
            runningSessions,
            pendingPermissionsBySession,
            pendingAskUsersBySession
          ),
        },
      ];
    });
  }, [
    currentSessionId,
    groups,
    normalizedSearchQuery,
    pendingAskUsersBySession,
    pendingPermissionsBySession,
    runningSessions,
  ]);

  useEffect(() => {
    setExpandedWorkspaceIds((current) => {
      const next = new Set(current);

      if (currentWorkspaceId) {
        next.add(currentWorkspaceId);
      }

      if (groups.length === 1) {
        next.add(groups[0].workspace.id);
      }

      for (const group of groupViews) {
        if (group.status === "running" || group.status === "needs-input") {
          next.add(group.workspace.id);
        }
      }

      if (next.size === current.size) {
        return current;
      }

      return next;
    });
  }, [currentWorkspaceId, groups, groupViews]);

  useEffect(() => {
    return () => {
      if (pathPreviewTimerRef.current !== null) {
        window.clearTimeout(pathPreviewTimerRef.current);
      }
      if (workspaceActionErrorTimerRef.current !== null) {
        window.clearTimeout(workspaceActionErrorTimerRef.current);
      }
    };
  }, []);

  const showWorkspaceActionError = (error: unknown, fallback: string) => {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const message = rawMessage.includes("workspace:rename")
      ? "重命名接口已更新，重启 Zora 后即可生效。"
      : rawMessage || fallback;

    setWorkspaceActionError(message);

    if (workspaceActionErrorTimerRef.current !== null) {
      window.clearTimeout(workspaceActionErrorTimerRef.current);
    }

    workspaceActionErrorTimerRef.current = window.setTimeout(() => {
      setWorkspaceActionError(null);
      workspaceActionErrorTimerRef.current = null;
    }, 4200);
  };

  const handlePathPreviewEnter = (workspaceId: string) => {
    if (pathPreviewTimerRef.current !== null) {
      window.clearTimeout(pathPreviewTimerRef.current);
    }

    pathPreviewTimerRef.current = window.setTimeout(() => {
      setPathPreviewWorkspaceId(workspaceId);
      pathPreviewTimerRef.current = null;
    }, PATH_PREVIEW_DELAY_MS);
  };

  const handlePathPreviewLeave = () => {
    if (pathPreviewTimerRef.current !== null) {
      window.clearTimeout(pathPreviewTimerRef.current);
      pathPreviewTimerRef.current = null;
    }

    setPathPreviewWorkspaceId(null);
  };

  const handleSwitchSession = (workspaceId: string, sessionId: string) => {
    void switchWorkspaceSession({ workspaceId, sessionId });
    setSettingsOpen(false);
  };

  const handleToggleWorkspace = (workspaceId: string) => {
    setPathPreviewWorkspaceId(null);
    setExpandedWorkspaceIds((current) => {
      const next = new Set(current);
      if (next.has(workspaceId)) {
        next.delete(workspaceId);
      } else {
        next.add(workspaceId);
      }
      return next;
    });
  };

  const handleToggleShowAll = (workspaceId: string) => {
    setShowAllWorkspaceIds((current) => {
      const next = new Set(current);
      if (next.has(workspaceId)) {
        next.delete(workspaceId);
      } else {
        next.add(workspaceId);
      }
      return next;
    });
  };

  const handleNewChatInWorkspace = (workspaceId: string) => {
    void startNewChatInWorkspace(workspaceId);
    setExpandedWorkspaceIds((current) => new Set(current).add(workspaceId));
    setSettingsOpen(false);
  };

  const handleDeleteWorkspace = async (workspace: Workspace) => {
    if (workspace.id === DEFAULT_WORKSPACE_ID) {
      return;
    }

    if (
      !window.confirm(
        `确定删除工作区「${workspace.name}」？该工作区下的本地会话数据也会被移除。`
      )
    ) {
      return;
    }

    try {
      await deleteWorkspace(workspace.id);
    } catch (error) {
      showWorkspaceActionError(error, "删除工作区失败，请稍后再试。");
    }
  };

  const handleRenameWorkspaceSubmit = async (workspace: Workspace) => {
    const nextName = workspaceRenameValue.trim();
    setRenamingWorkspaceId(null);
    setWorkspaceRenameValue("");

    if (!nextName || nextName === workspace.name) {
      return;
    }

    try {
      await renameWorkspace({
        workspaceId: workspace.id,
        name: nextName,
      });
    } catch (error) {
      showWorkspaceActionError(error, "重命名工作区失败，请稍后再试。");
    }
  };

  if (groupViews.length === 0) {
    return (
      <div className="px-2 py-8 text-center text-[12px] text-stone-400">
        {normalizedSearchQuery ? "没有匹配的会话" : "正在读取工作区..."}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {workspaceActionError ? (
        <div className="mx-1 rounded-[9px] bg-red-50/80 px-2.5 py-1.5 text-[12px] leading-4 text-red-600 ring-1 ring-red-100">
          {workspaceActionError}
        </div>
      ) : null}

      {groupViews.map((group) => {
        const workspace = group.workspace;
        const isExpanded =
          normalizedSearchQuery.length > 0 ||
          expandedWorkspaceIds.has(workspace.id);
        const isCurrentWorkspace = currentWorkspaceId === workspace.id;
        const isDefaultWorkspace = workspace.id === DEFAULT_WORKSPACE_ID;
        const showAll =
          normalizedSearchQuery.length > 0 || showAllWorkspaceIds.has(workspace.id);
        const shownSessions = showAll ? group.sessions : group.sessions.slice(0, 4);
        const hiddenCount = group.sessions.length - shownSessions.length;
        const hasWorkspaceStatus =
          group.status === "running" || group.status === "needs-input";
        const isWorkspaceMenuOpen = workspaceMenuOpenId === workspace.id;
        const isPinnedWorkspace = pinnedWorkspaceIds.has(workspace.id);
        const isRenamingWorkspace = renamingWorkspaceId === workspace.id;

        const shouldShowPathPreview =
          pathPreviewWorkspaceId === workspace.id &&
          Boolean(workspace.path) &&
          !isRenamingWorkspace &&
          !isWorkspaceMenuOpen;

        return (
          <div key={workspace.id} className="space-y-0.5">
            <div
              className={cn(
                "group/workspace relative flex min-h-9 items-center gap-1 rounded-[9px] px-1.5 pr-1 transition-colors",
                shouldShowPathPreview ? "z-[60]" : "z-0",
                isCurrentWorkspace
                  ? "bg-white/55 text-stone-900"
                  : "text-stone-700 hover:bg-white/50"
              )}
            >
              {isRenamingWorkspace ? (
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1">
                  <FolderIcon expanded={isExpanded} />
                  <input
                    autoFocus
                    value={workspaceRenameValue}
                    onChange={(event) => setWorkspaceRenameValue(event.target.value)}
                    onFocus={(event) => event.currentTarget.select()}
                    onBlur={() => void handleRenameWorkspaceSubmit(workspace)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void handleRenameWorkspaceSubmit(workspace);
                      }

                      if (event.key === "Escape") {
                        event.preventDefault();
                        setRenamingWorkspaceId(null);
                        setWorkspaceRenameValue("");
                      }
                    }}
                    className="h-7 min-w-0 flex-1 rounded-md bg-white px-2 text-[13px] font-medium text-stone-900 outline-none ring-1 ring-inset ring-stone-200 focus:ring-2 focus:ring-stone-900/10"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900/10"
                  onClick={() => handleToggleWorkspace(workspace.id)}
                  aria-expanded={isExpanded}
                >
                  <FolderIcon expanded={isExpanded} />
                  <span
                    onMouseEnter={() => handlePathPreviewEnter(workspace.id)}
                    onMouseLeave={handlePathPreviewLeave}
                    className={cn(
                      "min-w-0 truncate text-[14px] leading-5",
                      isCurrentWorkspace ? "font-medium" : "font-normal"
                    )}
                  >
                    {workspace.name}
                  </span>
                  {isDefaultWorkspace ? (
                    <span className="shrink-0 rounded bg-stone-200/45 px-1.5 py-0.5 text-[10px] font-medium text-stone-500">
                      默认
                    </span>
                  ) : null}
                  {isPinnedWorkspace ? (
                    <span className="shrink-0 rounded bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-600 ring-1 ring-orange-100/70">
                      置顶
                    </span>
                  ) : null}
                </button>
              )}

              <div
                className="relative h-7 w-[60px] shrink-0"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <div
                  className={cn(
                    "absolute right-0 top-1/2 -translate-y-1/2 transition-opacity",
                    isWorkspaceMenuOpen
                      ? "opacity-0"
                      : "opacity-100 group-hover/workspace:opacity-0"
                  )}
                >
                  {hasWorkspaceStatus ? <WorkspaceBadge status={group.status} /> : null}
                </div>

                <div
                  className={cn(
                    "absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover/workspace:opacity-100",
                    isWorkspaceMenuOpen && "opacity-100"
                  )}
                >
                  <DropdownMenu.Root
                    open={isWorkspaceMenuOpen}
                    onOpenChange={(open) =>
                      setWorkspaceMenuOpenId(open ? workspace.id : null)
                    }
                  >
                    <DropdownMenu.Trigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-stone-400 transition",
                          "hover:bg-stone-900/[0.05] hover:text-stone-700",
                          "focus-visible:opacity-100 focus-visible:outline-none",
                          isWorkspaceMenuOpen &&
                            "bg-white text-stone-800 ring-1 ring-stone-200/70"
                        )}
                        aria-label={`打开${workspace.name}的操作菜单`}
                      >
                        <svg
                          className="h-3.5 w-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 12h.01M12 12h.01M19 12h.01"
                          />
                        </svg>
                      </button>
                    </DropdownMenu.Trigger>

                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        align="end"
                        sideOffset={4}
                        className={cn(
                          "z-50 w-[132px] overflow-hidden rounded-[10px]",
                          "bg-white/95",
                          "ring-1 ring-stone-200/90 shadow-[0_8px_18px_rgba(41,37,36,0.10)]",
                          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
                        )}
                      >
                        <div className="px-0.5 py-0.5">
                          {isDefaultWorkspace ? (
                            <DropdownMenu.Item
                              disabled
                              className="flex w-full cursor-default items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[13px] text-stone-400 outline-none data-[disabled]:pointer-events-none"
                            >
                              <PinIcon className="h-3.5 w-3.5 shrink-0" />
                              <span>默认置顶</span>
                            </DropdownMenu.Item>
                          ) : (
                            <DropdownMenu.Item
                              className="flex w-full cursor-pointer items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[13px] text-stone-700 transition-colors focus:bg-stone-900/[0.04] focus:outline-none data-[highlighted]:bg-stone-900/[0.04]"
                              onSelect={() => togglePinWorkspace(workspace.id)}
                            >
                              <PinIcon className="h-3.5 w-3.5 shrink-0 text-stone-500" />
                              <span>{isPinnedWorkspace ? "取消置顶" : "置顶"}</span>
                            </DropdownMenu.Item>
                          )}
                          <DropdownMenu.Item
                            className="flex w-full cursor-pointer items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[13px] text-stone-700 transition-colors focus:bg-stone-900/[0.04] focus:outline-none data-[highlighted]:bg-stone-900/[0.04]"
                            onSelect={() => {
                              setWorkspaceRenameValue(workspace.name);
                              setRenamingWorkspaceId(workspace.id);
                            }}
                          >
                            <RenameIcon className="h-3.5 w-3.5 shrink-0 text-stone-500" />
                            <span>重命名</span>
                          </DropdownMenu.Item>
                          {!isDefaultWorkspace ? (
                            <DropdownMenu.Item
                              className="mt-0.5 flex w-full cursor-pointer items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[13px] text-red-700 transition-colors focus:bg-red-50 focus:outline-none data-[highlighted]:bg-red-50"
                              onSelect={() => void handleDeleteWorkspace(workspace)}
                            >
                              <TrashIcon className="h-3.5 w-3.5 shrink-0 text-red-500" />
                              <span>删除</span>
                            </DropdownMenu.Item>
                          ) : null}
                        </div>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>

                  <button
                    type="button"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-stone-400 transition hover:bg-stone-900/[0.05] hover:text-stone-700 focus-visible:opacity-100 focus-visible:outline-none"
                    onClick={() => handleNewChatInWorkspace(workspace.id)}
                    aria-label={`在${workspace.name}中新建会话`}
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
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
              </div>

              {shouldShowPathPreview ? (
                <div className="pointer-events-none absolute left-0 right-0 top-full z-[80] mt-1 rounded-[9px] bg-white/95 px-2.5 py-1.5 text-[12px] leading-4 text-stone-700 shadow-[0_8px_22px_rgba(41,37,36,0.12)] ring-1 ring-stone-200/80">
                  <span className="block break-all">{workspace.path}</span>
                </div>
              ) : null}
            </div>

            {isExpanded ? (
              <div className="ml-6 space-y-0.5 pl-0.5">
                {!group.loaded ? (
                  <div className="px-2 py-2 text-[12px] text-stone-400">加载中...</div>
                ) : shownSessions.length === 0 ? (
                  <button
                    type="button"
                    className="w-full rounded-[10px] px-2 py-2 text-left text-[12px] text-stone-400 transition hover:bg-white/40 hover:text-stone-600"
                    onClick={() => handleNewChatInWorkspace(workspace.id)}
                  >
                    暂无会话
                  </button>
                ) : (
                  shownSessions.map((session) => {
                    const status = getSessionStatus(
                      session.id,
                      currentSessionId,
                      runningSessions,
                      pendingPermissionsBySession,
                      pendingAskUsersBySession
                    );
                    const isActive =
                      !isSettingsOpen &&
                      currentWorkspaceId === workspace.id &&
                      currentSessionId === session.id;

                    return (
                      <SessionRow
                        key={session.id}
                        session={session}
                        workspaceId={workspace.id}
                        status={status}
                        isActive={isActive}
                        onSwitch={handleSwitchSession}
                      />
                    );
                  })
                )}

                {hiddenCount > 0 ? (
                  <button
                    type="button"
                    className="w-full rounded-[9px] px-2 py-1.5 text-left text-[12px] text-stone-400 transition hover:bg-white/40 hover:text-stone-600"
                    onClick={() => handleToggleShowAll(workspace.id)}
                  >
                    展开全部
                  </button>
                ) : showAllWorkspaceIds.has(workspace.id) &&
                  group.sessions.length > 4 &&
                  normalizedSearchQuery.length === 0 ? (
                  <button
                    type="button"
                    className="w-full rounded-[9px] px-2 py-1.5 text-left text-[12px] text-stone-400 transition hover:bg-white/40 hover:text-stone-600"
                    onClick={() => handleToggleShowAll(workspace.id)}
                  >
                    折叠显示
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
