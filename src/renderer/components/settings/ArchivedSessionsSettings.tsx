import { useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import type { ArchivedSessionEntry } from "../../../shared/zora";
import { DEFAULT_WORKSPACE_ID, restoreSessionAtom } from "../../store/workspace";
import { ARCHIVED_SESSIONS_CHANGED_EVENT } from "../../utils/archived-sessions-event";
import { cn } from "../../utils/cn";
import { getErrorMessage } from "../../utils/message";
import { TrashIcon } from "../ui/Icons";

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDate(value?: string): string {
  if (!value) {
    return "未知时间";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "未知时间";
  }

  return dateFormatter.format(date);
}

function RefreshIcon({ className }: { className?: string }) {
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
        d="M18.35 7.05A7.2 7.2 0 007.7 5.1"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.9}
        d="M18.55 3.95v3.2h-3.2"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.9}
        d="M5.65 16.95a7.2 7.2 0 0010.65 1.95"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.9}
        d="M5.45 20.05v-3.2h3.2"
      />
    </svg>
  );
}

export function ArchivedSessionsSettings() {
  const restoreSession = useSetAtom(restoreSessionAtom);
  const [entries, setEntries] = useState<ArchivedSessionEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ArchivedSessionEntry | null>(
    null
  );

  const archivedCount = entries.length;

  const loadEntries = async () => {
    setIsLoading(true);
    setError(null);

    try {
      setEntries(await window.zora.listArchivedSessions());
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadEntries();
  }, []);

  useEffect(() => {
    const handleArchivedSessionsChanged = () => {
      void loadEntries();
    };

    window.addEventListener(
      ARCHIVED_SESSIONS_CHANGED_EVENT,
      handleArchivedSessionsChanged
    );

    return () => {
      window.removeEventListener(
        ARCHIVED_SESSIONS_CHANGED_EVENT,
        handleArchivedSessionsChanged
      );
    };
  }, []);

  const handleRestore = async (entry: ArchivedSessionEntry) => {
    setRestoringId(entry.session.id);
    setError(null);

    try {
      const restored = await restoreSession({
        sessionId: entry.session.id,
        workspaceId: entry.workspaceId,
      });

      if (restored) {
        setEntries((current) =>
          current.filter((item) => item.session.id !== entry.session.id)
        );
      } else {
        await loadEntries();
      }
    } catch (restoreError) {
      setError(getErrorMessage(restoreError));
    } finally {
      setRestoringId(null);
    }
  };

  const handleDelete = (entry: ArchivedSessionEntry) => {
    setDeleteTarget(entry);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    const target = deleteTarget;
    setDeletingId(target.session.id);
    setError(null);

    try {
      await window.zora.deleteSession(target.session.id, target.workspaceId);
      setEntries((current) =>
        current.filter((item) => item.session.id !== target.session.id)
      );
      setDeleteTarget(null);
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="space-y-5">
      <div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[20px] font-semibold tracking-tight text-stone-950">
              已归档会话
            </h2>
            <p className="mt-1 text-[12px] text-stone-500">
              {archivedCount > 0 ? `${archivedCount} 条会话` : "暂无归档"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadEntries()}
            className="flex h-8 w-8 items-center justify-center rounded-md text-stone-400 transition hover:bg-stone-100 hover:text-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isLoading}
            aria-label="刷新已归档会话"
            title="刷新"
          >
            <RefreshIcon className={cn("h-4 w-4", isLoading && "animate-spin")} />
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700 ring-1 ring-red-100">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        {isLoading ? (
          <div className="px-4 py-8 text-center text-[13px] text-stone-500">
            加载中...
          </div>
        ) : entries.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <div className="text-[14px] font-medium text-stone-800">没有已归档会话</div>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {entries.map((entry) => {
              const isRestoring = restoringId === entry.session.id;
              const isDeleting = deletingId === entry.session.id;
              const isBusy = isRestoring || isDeleting;
              return (
                <div
                  key={`${entry.workspaceId}:${entry.session.id}`}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium text-stone-900">
                      {entry.session.title}
                    </div>
                    <div className="mt-1 flex min-w-0 items-center gap-2 text-[12px] text-stone-500">
                      <span className="truncate">{entry.workspaceName}</span>
                      <span className="h-1 w-1 shrink-0 rounded-full bg-stone-300" />
                      <span className="shrink-0">
                        {formatDate(entry.session.archivedAt)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleDelete(entry)}
                      disabled={isBusy}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-red-600 transition",
                        "hover:bg-red-50 hover:text-red-700",
                        "disabled:cursor-not-allowed disabled:opacity-40"
                      )}
                      aria-label={`永久删除${entry.session.title}`}
                      title="永久删除"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                      <span>{isDeleting ? "删除中" : "删除"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRestore(entry)}
                      disabled={isBusy}
                      className={cn(
                        "shrink-0 rounded-md px-3 py-1.5 text-[12px] font-medium transition",
                        "bg-stone-900 text-white hover:bg-stone-800",
                        "disabled:cursor-not-allowed disabled:bg-stone-300"
                      )}
                    >
                      {isRestoring ? "恢复中" : "恢复"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {deleteTarget ? (
        <DeleteArchivedSessionDialog
          entry={deleteTarget}
          busy={deletingId === deleteTarget.session.id}
          onCancel={() => {
            if (!deletingId) {
              setDeleteTarget(null);
            }
          }}
          onConfirm={() => void handleConfirmDelete()}
        />
      ) : null}
    </section>
  );
}

function DeleteArchivedSessionDialog({
  entry,
  busy,
  onCancel,
  onConfirm,
}: {
  entry: ArchivedSessionEntry;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isDefaultWorkspace = entry.workspaceId === DEFAULT_WORKSPACE_ID;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [busy, onCancel]);

  return (
    <div
      className="fixed inset-0 z-[180] flex items-center justify-center bg-stone-900/24 px-4 backdrop-blur-[1px]"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onCancel();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-archived-session-title"
        className="w-full max-w-[390px] rounded-2xl border border-stone-200 bg-[#fffdf9] p-5 shadow-[0_24px_60px_rgba(35,31,27,0.22)]"
      >
        <div
          id="delete-archived-session-title"
          className="text-[16px] font-semibold text-stone-950"
        >
          永久删除归档会话？
        </div>
        <div className="mt-3 rounded-xl bg-stone-50 px-3 py-2">
          <div className="text-[11px] font-medium text-stone-400">会话</div>
          <div className="mt-1 line-clamp-2 text-[13px] font-medium leading-relaxed text-stone-900">
            {entry.session.title}
          </div>
        </div>

        <div className="mt-4 space-y-2 text-[13px] leading-relaxed">
          <div>
            <div className="font-medium text-stone-900">将删除</div>
            <div className="mt-0.5 text-stone-500">
              {isDefaultWorkspace
                ? "会话记录、附件和这条会话生成的默认区文件。"
                : "会话记录和附件。"}
            </div>
          </div>
          {!isDefaultWorkspace ? (
            <div>
              <div className="font-medium text-stone-900">不会删除</div>
              <div className="mt-0.5 text-stone-500">项目目录或项目文件。</div>
            </div>
          ) : null}
          <div className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-medium text-red-700 ring-1 ring-red-100">
            删除后无法恢复。
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="h-8 rounded-lg border border-stone-200 bg-white px-3 text-[12px] font-medium text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="h-8 rounded-lg bg-red-600 px-3 text-[12px] font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
          >
            {busy ? "删除中" : "永久删除"}
          </button>
        </div>
      </div>
    </div>
  );
}
