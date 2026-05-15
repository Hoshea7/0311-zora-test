import { useState } from "react";
import { useSetAtom } from "jotai";
import type { ScheduledTaskDetailLink } from "../../types";
import { selectedScheduledTaskSelectionAtom } from "../../store/schedule";
import { activeMainViewAtom } from "../../store/ui";
import { cn } from "../../utils/cn";

export function ScheduleTaskLinkButton({
  link,
  className,
}: {
  link: ScheduledTaskDetailLink;
  className?: string;
}) {
  const setSelectedTaskSelection = useSetAtom(selectedScheduledTaskSelectionAtom);
  const setActiveMainView = useSetAtom(activeMainViewAtom);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"idle" | "missing" | "error">("idle");

  const handleOpen = async () => {
    if (busy) {
      return;
    }

    setBusy(true);

    try {
      const task = await window.zora.getScheduledTask(link.taskId, link.workspaceId);

      if (!task) {
        setState("missing");
        return;
      }

      setState("idle");
      setSelectedTaskSelection({
        taskId: link.taskId,
        workspaceId: link.workspaceId,
      });
      setActiveMainView("schedule");
    } catch (error) {
      console.error("[ScheduleTaskLinkButton] Failed to open scheduled task.", error);
      setState("error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        void handleOpen();
      }}
      disabled={busy}
      aria-disabled={state !== "idle"}
      className={cn(
        "inline-flex shrink-0 items-center rounded-lg border px-2.5 py-1 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
        state !== "idle"
          ? "border-stone-200 bg-stone-50 text-stone-400"
          : "border-[#ead8c6] bg-[#fff8f1] text-[#9f6243] hover:border-[#dfc5ae] hover:bg-[#fff3e8]",
        className
      )}
    >
      {state === "missing"
        ? "任务已删除"
        : state === "error"
          ? "无法打开"
          : busy
            ? "打开中..."
            : link.label}
    </button>
  );
}
