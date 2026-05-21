import type { RefObject } from "react";
import { cn } from "../../../utils/cn";
import { ArchivedSessionCheckbox } from "./ArchivedSessionCheckbox";

interface ArchivedSessionsToolbarProps {
  allSelected: boolean;
  indeterminate: boolean;
  isBusy: boolean;
  isRestoring: boolean;
  selectedCount: number;
  selectAllCheckboxRef: RefObject<HTMLInputElement>;
  onClearSelection: () => void;
  onDeleteSelected: () => void;
  onRestoreSelected: () => void;
  onToggleSelectAll: () => void;
}

export function ArchivedSessionsToolbar({
  allSelected,
  indeterminate,
  isBusy,
  isRestoring,
  selectedCount,
  selectAllCheckboxRef,
  onClearSelection,
  onDeleteSelected,
  onRestoreSelected,
  onToggleSelectAll,
}: ArchivedSessionsToolbarProps) {
  const hasSelection = selectedCount > 0;

  return (
    <div className="flex h-10 items-center justify-between gap-4 border-b border-stone-100 bg-stone-50/70 px-5">
      <div className="flex h-7 items-center gap-2 text-[11px] font-medium text-stone-600">
        <ArchivedSessionCheckbox
          ref={selectAllCheckboxRef}
          label={allSelected ? "取消选择全部归档会话" : "选择全部归档会话"}
          checked={allSelected}
          indeterminate={indeterminate}
          disabled={isBusy}
          onChange={onToggleSelectAll}
        />
        <span>全选</span>
      </div>

      <div
        className={cn(
          "flex h-7 min-w-[280px] shrink-0 items-center justify-end gap-3.5 transition-opacity duration-150",
          hasSelection ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        aria-hidden={!hasSelection}
      >
        <span className="whitespace-nowrap text-[11px] font-medium text-stone-400">
          已选 {selectedCount}
        </span>
        <button
          type="button"
          onClick={onClearSelection}
          disabled={isBusy || !hasSelection}
          className="text-[11px] font-medium text-stone-500 transition hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          取消选择
        </button>
        <button
          type="button"
          onClick={onRestoreSelected}
          disabled={isBusy || !hasSelection}
          className="text-[11px] font-medium text-stone-600 transition hover:text-stone-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRestoring ? "恢复中" : "批量恢复"}
        </button>
        <button
          type="button"
          onClick={onDeleteSelected}
          disabled={isBusy || !hasSelection}
          className="text-[11px] font-medium text-red-500 transition hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          批量删除
        </button>
      </div>
    </div>
  );
}
