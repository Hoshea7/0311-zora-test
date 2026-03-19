import { useEffect, useRef, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import type { PermissionMode } from "../../../shared/zora";
import {
  permissionModeAtom,
  setPermissionModeAtom,
} from "../../store/hitl";
import { cn } from "../../utils/cn";

const MODE_ORDER: PermissionMode[] = ["ask", "smart", "yolo"];

const MODE_META: Record<
  PermissionMode,
  {
    label: string;
    tooltip: string;
    buttonClassName: string;
    icon: React.ReactNode;
  }
> = {
  ask: {
    label: "Ask",
    tooltip: "写入操作需要确认",
    buttonClassName:
      "text-emerald-600/90 hover:text-emerald-700 bg-transparent hover:bg-emerald-50 border-transparent",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  smart: {
    label: "Smart",
    tooltip: "读写操作自动执行",
    buttonClassName:
      "text-amber-600/90 hover:text-amber-700 bg-transparent hover:bg-amber-50 border-transparent",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
        <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3l1.9 5.8 1.9-5.8a2 2 0 0 1 1.3-1.3l5.8-1.9-5.8-1.9a2 2 0 0 1-1.3-1.3z" />
      </svg>
    ),
  },
  yolo: {
    label: "YOLO",
    tooltip: "所有操作自动执行",
    buttonClassName:
      "text-rose-500 hover:text-rose-700 bg-transparent hover:bg-rose-50 border-transparent",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
};

function getNextMode(mode: PermissionMode): PermissionMode {
  const currentIndex = MODE_ORDER.indexOf(mode);
  const nextIndex = (currentIndex + 1) % MODE_ORDER.length;
  return MODE_ORDER[nextIndex];
}

export function PermissionModeButton() {
  const mode = useAtomValue(permissionModeAtom);
  const setPermissionMode = useSetAtom(setPermissionModeAtom);
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const tooltipTimerRef = useRef<number | null>(null);

  const meta = MODE_META[mode];

  useEffect(() => {
    return () => {
      if (tooltipTimerRef.current !== null) {
        window.clearTimeout(tooltipTimerRef.current);
      }
    };
  }, []);

  const clearTooltipTimer = () => {
    if (tooltipTimerRef.current !== null) {
      window.clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
  };

  const hideTooltip = () => {
    clearTooltipTimer();
    setIsTooltipOpen(false);
  };

  const showTooltipWithDelay = () => {
    clearTooltipTimer();
    tooltipTimerRef.current = window.setTimeout(() => {
      setIsTooltipOpen(true);
    }, 300);
  };

  const applyMode = async (nextMode: PermissionMode) => {
    setIsUpdating(true);
    console.log(`[permission-mode] Applying mode change: ${mode} -> ${nextMode}`);

    try {
      await setPermissionMode(nextMode);
      setIsTooltipOpen(false);
      console.log(`[permission-mode] Mode changed successfully: ${nextMode}`);
    } catch (error) {
      console.error("[permission-mode] Failed to update mode.", error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCycle = async () => {
    if (isUpdating) {
      return;
    }

    const nextMode = getNextMode(mode);
    console.log(`[permission-mode] Cycle requested: ${mode} -> ${nextMode}`);
    await applyMode(nextMode);
  };

  return (
    <div className="relative z-20">
      {isTooltipOpen ? (
        <div className="pointer-events-none absolute bottom-full left-0 z-[120] mb-2 w-max max-w-60">
          <div className="rounded-lg border border-stone-200/60 bg-white/95 backdrop-blur-sm px-2.5 py-1.5 text-xs font-medium leading-tight text-stone-600 shadow-[0_4px_12px_rgba(0,0,0,0.06)]">
            {meta.tooltip}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          void handleCycle();
        }}
        onMouseEnter={showTooltipWithDelay}
        onMouseLeave={hideTooltip}
        onFocus={() => setIsTooltipOpen(true)}
        onBlur={hideTooltip}
        disabled={isUpdating}
        aria-label={`当前权限模式：${meta.label}`}
        className={cn(
          "inline-flex h-7 items-center justify-center gap-1.5 rounded-full border px-2.5 text-xs font-medium tracking-wide transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
          meta.buttonClassName
        )}
      >
        <span aria-hidden="true" className="flex items-center justify-center">
          {meta.icon}
        </span>
        <span>{meta.label}</span>
      </button>
    </div>
  );
}
