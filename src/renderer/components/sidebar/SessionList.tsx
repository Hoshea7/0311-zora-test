import { useAtom, useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { runningSessionsAtom } from "../../store/chat";
import {
  groupedSessionsAtom,
  currentSessionIdAtom,
  deleteSessionAtom,
  renameSessionAtom,
  switchSessionAtom
} from "../../store/workspace";
import { cn } from "../../utils/cn";
import type { Session } from "../../types";

/**
 * 会话列表组件
 * 显示按时间分组的会话列表和新建按钮
 */
export function SessionList() {
  const [groupedSessions] = useAtom(groupedSessionsAtom);
  const [currentSessionId] = useAtom(currentSessionIdAtom);
  const [runningSessions] = useAtom(runningSessionsAtom);
  const switchSession = useSetAtom(switchSessionAtom);
  const deleteSession = useSetAtom(deleteSessionAtom);
  const renameSession = useSetAtom(renameSessionAtom);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpenId(null);
      }
    };

    if (menuOpenId) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuOpenId]);

  const handleSwitchSession = (sessionId: string) => {
    switchSession(sessionId);
  };

  const handleRenameSubmit = (sessionId: string, currentTitle: string) => {
    const trimmed = renameValue.trim();

    if (trimmed.length > 0 && trimmed !== currentTitle) {
      renameSession({ sessionId, title: trimmed });
    }

    setRenamingId(null);
    setRenameValue("");
  };

  const handleRenameCancel = () => {
    setRenamingId(null);
    setRenameValue("");
  };

  const handleDelete = (sessionId: string, title: string) => {
    setMenuOpenId(null);

    if (window.confirm(`确定删除会话「${title}」？此操作不可撤销。`)) {
      deleteSession(sessionId);
    }
  };

  const renderSession = (session: Session) => (
    <div
      key={session.id}
      className={cn(
        "group relative flex items-center gap-2 rounded-lg px-3 py-2 transition",
        currentSessionId === session.id
          ? "bg-stone-100"
          : "hover:bg-stone-50"
      )}
      onMouseEnter={() => setHoveredId(session.id)}
      onMouseLeave={() => setHoveredId((current) => (current === session.id ? null : current))}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (renamingId !== session.id) {
            handleSwitchSession(session.id);
          }
        }}
        onKeyDown={(event) => {
          if (renamingId === session.id) {
            return;
          }

          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleSwitchSession(session.id);
          }
        }}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <div className="flex h-5 w-5 items-center justify-center">
          {runningSessions.has(session.id) ? (
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500"></span>
            </span>
          ) : (
            <div
              className={cn(
                "h-2 w-2 rounded-full border-2",
                currentSessionId === session.id
                  ? "border-stone-400"
                  : "border-stone-300"
              )}
            ></div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {renamingId === session.id ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onFocus={(event) => event.currentTarget.select()}
              onBlur={() => handleRenameSubmit(session.id, session.title)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleRenameSubmit(session.id, session.title);
                }

                if (event.key === "Escape") {
                  event.preventDefault();
                  handleRenameCancel();
                }
              }}
              className="w-full rounded-md border border-stone-300 bg-white px-2 py-1 text-sm text-stone-900 outline-none transition focus:border-stone-400"
            />
          ) : (
            <>
              <div className="truncate text-sm text-stone-900">{session.title}</div>
              <div className="text-xs text-stone-500">
                {new Date(session.createdAt).toLocaleString("zh-CN", {
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit"
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {(hoveredId === session.id || menuOpenId === session.id) &&
        renamingId !== session.id && (
          <div
            ref={menuOpenId === session.id ? menuRef : undefined}
            className="relative shrink-0"
          >
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpenId((current) => (current === session.id ? null : session.id));
              }}
              className={cn(
                "rounded-md p-1 text-stone-400 transition",
                menuOpenId === session.id
                  ? "bg-stone-200 text-stone-700"
                  : "hover:bg-stone-200/70 hover:text-stone-600"
              )}
              aria-label={`打开${session.title}的操作菜单`}
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
                  d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"
                />
              </svg>
            </button>

            {menuOpenId === session.id && (
              <div className="absolute right-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-lg shadow-stone-900/8">
                <button
                  type="button"
                  className="w-full px-3 py-1.5 text-left text-sm text-stone-700 transition-colors hover:bg-stone-50"
                  onClick={(event) => {
                    event.stopPropagation();
                    setMenuOpenId(null);
                    setRenameValue(session.title);
                    setRenamingId(session.id);
                  }}
                >
                  重命名
                </button>
                <button
                  type="button"
                  className="w-full px-3 py-1.5 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDelete(session.id, session.title);
                  }}
                >
                  删除
                </button>
              </div>
            )}
          </div>
        )}
    </div>
  );

  return (
    <div className="space-y-1">
      {/* 置顶会话 */}
      {groupedSessions.pinned.length > 0 && (
        <div className="space-y-1">
          {groupedSessions.pinned.map(renderSession)}
        </div>
      )}

      {/* 今天的会话 */}
      {groupedSessions.today.length > 0 && (
        <div className="space-y-1">
          {groupedSessions.today.map(renderSession)}
        </div>
      )}

      {/* 更早的会话 */}
      {groupedSessions.earlier.length > 0 && (
        <div className="space-y-1">
          {groupedSessions.earlier.map(renderSession)}
        </div>
      )}
    </div>
  );
}
