import { useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ArchivedSessionEntry } from "../../../shared/zora";
import { deleteSessionAtom, restoreSessionAtom } from "../../store/workspace";
import { ARCHIVED_SESSIONS_CHANGED_EVENT } from "../../utils/archived-sessions-event";
import { cn } from "../../utils/cn";
import { getErrorMessage } from "../../utils/message";
import { RefreshIcon } from "../ui/Icons";
import { ArchivedSessionActionDialog } from "./archived-sessions/ArchivedSessionActionDialog";
import { ArchivedSessionRow } from "./archived-sessions/ArchivedSessionRow";
import { ArchivedSessionsToolbar } from "./archived-sessions/ArchivedSessionsToolbar";
import {
  collectArchivedEntryResults,
  formatBatchActionError,
  getArchivedSessionKey,
  removeEntriesByKey,
  removeSelectedKeys,
} from "./archived-sessions/archived-session-utils";

export function ArchivedSessionsSettings() {
  const restoreSession = useSetAtom(restoreSessionAtom);
  const deleteSession = useSetAtom(deleteSessionAtom);
  const loadRequestIdRef = useRef(0);
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<ArchivedSessionEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [pendingAction, setPendingAction] = useState<
    "restore" | "delete" | null
  >(null);
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(() => new Set());
  const [deleteTargets, setDeleteTargets] = useState<
    ArchivedSessionEntry[] | null
  >(null);
  const [restoreTargets, setRestoreTargets] = useState<
    ArchivedSessionEntry[] | null
  >(null);

  const selectedEntries = useMemo(
    () =>
      entries.filter((entry) =>
        selectedKeys.has(getArchivedSessionKey(entry))
      ),
    [entries, selectedKeys]
  );
  const selectedCount = selectedEntries.length;
  const isBusy = pendingAction !== null;
  const allSelected = entries.length > 0 && selectedCount === entries.length;
  const isSelectionMixed = selectedCount > 0 && selectedCount < entries.length;

  const loadEntries = useCallback(async () => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    setIsLoading(true);
    setError(null);

    try {
      const nextEntries = await window.zora.listArchivedSessions();
      if (loadRequestIdRef.current === requestId) {
        setEntries(nextEntries);
      }
    } catch (loadError) {
      if (loadRequestIdRef.current === requestId) {
        setError(getErrorMessage(loadError));
      }
    } finally {
      if (loadRequestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

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
  }, [loadEntries]);

  useEffect(() => {
    setSelectedKeys((current) => {
      const availableKeys = new Set(entries.map(getArchivedSessionKey));
      const next = new Set([...current].filter((key) => availableKeys.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [entries]);

  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = isSelectionMixed;
    }
  }, [isSelectionMixed]);

  const toggleEntrySelection = (entry: ArchivedSessionEntry) => {
    const key = getArchivedSessionKey(entry);
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedKeys((current) => {
      const visibleKeys = entries.map(getArchivedSessionKey);
      const allVisibleSelected = visibleKeys.every((key) => current.has(key));
      return allVisibleSelected ? new Set() : new Set(visibleKeys);
    });
  };

  const runEntriesAction = async ({
    action,
    actionLabel,
    targets,
    run,
    onFinished,
  }: {
    action: "restore" | "delete";
    actionLabel: string;
    targets: ArchivedSessionEntry[];
    run: (entry: ArchivedSessionEntry) => Promise<void>;
    onFinished?: () => void;
  }) => {
    if (targets.length === 0) {
      return;
    }

    setPendingAction(action);
    setPendingKeys(new Set(targets.map(getArchivedSessionKey)));
    setError(null);

    try {
      const { successfulKeys, failures } = await collectArchivedEntryResults(
        targets,
        run
      );

      if (successfulKeys.size > 0) {
        setEntries((current) => removeEntriesByKey(current, successfulKeys));
        setSelectedKeys((current) =>
          removeSelectedKeys(current, successfulKeys)
        );
      }

      onFinished?.();

      if (failures.length > 0) {
        setError(
          formatBatchActionError(
            actionLabel,
            failures.length,
            getErrorMessage(failures[0].reason)
          )
        );
        await loadEntries();
      }
    } finally {
      setPendingAction(null);
      setPendingKeys(new Set());
    }
  };

  const handleConfirmRestore = async () => {
    if (!restoreTargets || restoreTargets.length === 0) {
      return;
    }

    await runEntriesAction({
      action: "restore",
      actionLabel: "恢复",
      targets: restoreTargets,
      run: async (entry) => {
        const restored = await restoreSession({
          sessionId: entry.session.id,
          workspaceId: entry.workspaceId,
        });

        if (!restored) {
          throw new Error("会话不存在或已被恢复。");
        }
      },
      onFinished: () => setRestoreTargets(null),
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargets || deleteTargets.length === 0) {
      return;
    }

    await runEntriesAction({
      action: "delete",
      actionLabel: "删除",
      targets: deleteTargets,
      run: async (entry) => {
        await deleteSession(entry.session.id, entry.workspaceId);
      },
      onFinished: () => setDeleteTargets(null),
    });
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
              {entries.length > 0 ? `${entries.length} 条会话` : "暂无归档"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadEntries()}
            className="flex h-8 w-8 items-center justify-center rounded-md text-stone-400 transition hover:bg-stone-100 hover:text-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isLoading || isBusy}
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

      <div className="overflow-hidden rounded-[18px] border border-stone-200/80 bg-white shadow-[0_1px_2px_rgba(35,31,27,0.04)]">
        {isLoading ? (
          <div className="px-4 py-8 text-center text-[13px] text-stone-500">
            加载中...
          </div>
        ) : entries.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <div className="text-[14px] font-medium text-stone-800">
              没有已归档会话
            </div>
          </div>
        ) : (
          <>
            <ArchivedSessionsToolbar
              allSelected={allSelected}
              indeterminate={isSelectionMixed}
              isBusy={isBusy}
              isRestoring={pendingAction === "restore"}
              selectedCount={selectedCount}
              selectAllCheckboxRef={selectAllCheckboxRef}
              onClearSelection={() => setSelectedKeys(new Set())}
              onDeleteSelected={() => setDeleteTargets(selectedEntries)}
              onRestoreSelected={() => setRestoreTargets(selectedEntries)}
              onToggleSelectAll={toggleSelectAll}
            />

            <div className="space-y-1 p-2">
              {entries.map((entry) => {
                const key = getArchivedSessionKey(entry);
                const isPending = pendingKeys.has(key);
                return (
                  <ArchivedSessionRow
                    key={key}
                    entry={entry}
                    isBusy={isBusy}
                    isDeleting={pendingAction === "delete" && isPending}
                    isRestoring={pendingAction === "restore" && isPending}
                    isSelected={selectedKeys.has(key)}
                    onDelete={() => setDeleteTargets([entry])}
                    onRestore={() => setRestoreTargets([entry])}
                    onToggleSelected={() => toggleEntrySelection(entry)}
                  />
                );
              })}
            </div>
          </>
        )}
      </div>

      {deleteTargets ? (
        <ArchivedSessionActionDialog
          action="delete"
          entries={deleteTargets}
          busy={pendingAction === "delete"}
          onCancel={() => {
            if (pendingAction !== "delete") {
              setDeleteTargets(null);
            }
          }}
          onConfirm={() => void handleConfirmDelete()}
        />
      ) : null}

      {restoreTargets ? (
        <ArchivedSessionActionDialog
          action="restore"
          entries={restoreTargets}
          busy={pendingAction === "restore"}
          onCancel={() => {
            if (pendingAction !== "restore") {
              setRestoreTargets(null);
            }
          }}
          onConfirm={() => void handleConfirmRestore()}
        />
      ) : null}
    </section>
  );
}
