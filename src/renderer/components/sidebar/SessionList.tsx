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
import { isSettingsOpenAtom } from "../../store/ui";
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
  const setSettingsOpen = useSetAtom(isSettingsOpenAtom);
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
    setSettingsOpen(false);
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
        "group relative flex items-center gap-2 rounded-xl px-3 py-2.5 backdrop-blur-[2px] transition",
        "ring-1 ring-inset",
        "before:pointer-events-none before:absolute before:bottom-2.5 before:left-1 before:top-2.5 before:w-[2px] before:rounded-full before:transition-opacity",
        currentSessionId === session.id
          ? cn(
              "bg-white/70 ring-stone-200/80 shadow-sm shadow-stone-900/5",
              "before:bg-stone-900/35 before:opacity-100"
            )
          : cn(
              "bg-transparent ring-transparent",
              "hover:bg-white/55 hover:ring-stone-200/70",
              "before:bg-stone-900/15 before:opacity-0 hover:before:opacity-100"
            )
      )}
      onMouseEnter={() => setHoveredId(session.id)}
      onMouseLeave={() =>
        setHoveredId((current) => (current === session.id ? null : current))
      }
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
        className={cn(
          "flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left",
          "rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900/10"
        )}
      >
        <div className="flex h-5 w-5 items-center justify-center">
          {runningSessions.has(session.id) ? (
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400/80 opacity-75"></span>
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sky-500 ring-1 ring-inset ring-sky-600/20"></span>
            </span>
          ) : (
            <div
              className={cn(
                "h-2 w-2 rounded-full border-2",
                currentSessionId === session.id
                  ? "border-stone-500/70"
                  : "border-stone-300/80 group-hover:border-stone-400/70"
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
              className={cn(
                "w-full rounded-xl bg-white/90 px-2.5 py-1.5 text-sm text-stone-900",
                "ring-1 ring-inset ring-stone-200/80 shadow-[0_1px_0_rgba(255,255,255,0.85)]",
                "outline-none transition placeholder:text-stone-400",
                "hover:ring-stone-300/70 focus:ring-2 focus:ring-stone-900/10"
              )}
            />
          ) : (
            <>
              <div
                className={cn(
                  "truncate text-sm",
                  currentSessionId === session.id
                    ? "font-semibold text-stone-900"
                    : "font-medium text-stone-800"
                )}
              >
                {session.title}
              </div>
              <div className="mt-0.5 text-[11px] leading-4 text-stone-500">
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
                setMenuOpenId((current) =>
                  current === session.id ? null : session.id
                );
              }}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-xl transition",
                "text-stone-400 ring-1 ring-inset ring-transparent",
                "hover:bg-white/60 hover:text-stone-700 hover:ring-stone-200/70",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900/10",
                menuOpenId === session.id &&
                  "bg-white/80 text-stone-800 ring-stone-200/80 shadow-sm shadow-stone-900/5"
              )}
              aria-label={`打开${session.title}的操作菜单`}
              aria-haspopup="menu"
              aria-expanded={menuOpenId === session.id}
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
              <div
                className={cn(
                  "absolute right-0 top-full z-50 mt-2 w-40 overflow-hidden rounded-2xl",
                  "bg-[#fcfaf7]/90 backdrop-blur-md",
                  "ring-1 ring-stone-200/80 shadow-[0_22px_60px_rgba(41,37,36,0.18)]"
                )}
                role="menu"
              >
                <div className="px-1.5 py-1.5">
                  <button
                    type="button"
                    className={cn(
                      "w-full rounded-xl px-3 py-2 text-left text-sm text-stone-700 transition-colors",
                      "hover:bg-stone-900/[0.04]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900/10"
                    )}
                    onClick={(event) => {
                      event.stopPropagation();
                      setMenuOpenId(null);
                      setRenameValue(session.title);
                      setRenamingId(session.id);
                    }}
                    role="menuitem"
                  >
                    重命名
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "mt-1 w-full rounded-xl px-3 py-2 text-left text-sm text-red-700 transition-colors",
                      "hover:bg-red-50",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/20"
                    )}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDelete(session.id, session.title);
                    }}
                    role="menuitem"
                  >
                    删除
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
    </div>
  );

  return (
    <div className="space-y-2">
      {/* 置顶会话 */}
      {groupedSessions.pinned.length > 0 && (
        <div className="space-y-1.5">{groupedSessions.pinned.map(renderSession)}</div>
      )}

      {/* 今天的会话 */}
      {groupedSessions.today.length > 0 && (
        <div className="space-y-1.5">{groupedSessions.today.map(renderSession)}</div>
      )}

      {/* 更早的会话 */}
      {groupedSessions.earlier.length > 0 && (
        <div className="space-y-1.5">{groupedSessions.earlier.map(renderSession)}</div>
      )}
    </div>
  );
}
