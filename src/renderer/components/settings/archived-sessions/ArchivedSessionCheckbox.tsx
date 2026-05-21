import { forwardRef } from "react";
import { cn } from "../../../utils/cn";

interface ArchivedSessionCheckboxProps {
  label: string;
  checked: boolean;
  disabled?: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  className?: string;
}

export const ArchivedSessionCheckbox = forwardRef<
  HTMLInputElement,
  ArchivedSessionCheckboxProps
>(function ArchivedSessionCheckbox(
  { label, checked, disabled, indeterminate = false, onChange, className },
  ref
) {
  return (
    <label
      className={cn(
        "inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center",
        disabled && "cursor-not-allowed",
        className
      )}
    >
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-label={label}
        aria-checked={indeterminate ? "mixed" : checked}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          "flex h-4 w-4 items-center justify-center rounded-[4px] border transition",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-stone-300 peer-focus-visible:ring-offset-2",
          checked || indeterminate
            ? "border-stone-950 bg-stone-950 text-white"
            : "border-stone-300 bg-white text-transparent group-hover:border-stone-400",
          disabled && "opacity-45"
        )}
      >
        {indeterminate ? <span className="h-[2px] w-2 rounded bg-current" /> : null}
        {checked && !indeterminate ? (
          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
            <path
              d="M3 6.1l2 2 4-4.2"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </span>
    </label>
  );
});
