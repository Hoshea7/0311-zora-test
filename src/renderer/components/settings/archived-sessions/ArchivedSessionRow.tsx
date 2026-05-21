import type { ArchivedSessionEntry } from "../../../../shared/zora";
import { cn } from "../../../utils/cn";
import { TrashIcon } from "../../ui/Icons";
import { ArchivedSessionCheckbox } from "./ArchivedSessionCheckbox";
import { formatArchivedDate } from "./archived-session-utils";

interface ArchivedSessionRowProps {
  entry: ArchivedSessionEntry;
  isBusy: boolean;
  isDeleting: boolean;
  isRestoring: boolean;
  isSelected: boolean;
  onDelete: () => void;
  onRestore: () => void;
  onToggleSelected: () => void;
}

export function ArchivedSessionRow({
  entry,
  isBusy,
  isDeleting,
  isRestoring,
  isSelected,
  onDelete,
  onRestore,
  onToggleSelected,
}: ArchivedSessionRowProps) {
  return (
    <div
      className={cn(
        "group flex min-h-[66px] items-center gap-3 rounded-xl px-3 py-2 transition-colors",
        isSelected ? "bg-stone-100/70" : "hover:bg-stone-50"
      )}
    >
      <ArchivedSessionCheckbox
        label={`选择${entry.session.title}`}
        checked={isSelected}
        disabled={isBusy}
        onChange={onToggleSelected}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium text-stone-900">
          {entry.session.title}
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-2 text-[11.5px] text-stone-500">
          <span className="truncate">{entry.workspaceName}</span>
          <span className="h-1 w-1 shrink-0 rounded-full bg-stone-300" />
          <span className="shrink-0">
            {formatArchivedDate(entry.session.archivedAt)}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onDelete}
          disabled={isBusy}
          className={cn(
            "flex h-7 items-center gap-1.5 px-1 text-[11.5px] font-medium text-red-500 transition",
            "hover:text-red-600",
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
          onClick={onRestore}
          disabled={isBusy}
          className={cn(
            "h-7 shrink-0 px-1.5 text-[11.5px] font-medium text-stone-600 transition",
            "hover:text-stone-950",
            "disabled:cursor-not-allowed disabled:opacity-40"
          )}
        >
          {isRestoring ? "恢复中" : "恢复"}
        </button>
      </div>
    </div>
  );
}
