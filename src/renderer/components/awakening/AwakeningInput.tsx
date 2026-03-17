import { useState } from "react";

interface Props {
  onSubmit: (text: string) => void;
  disabled?: boolean;
}

export function AwakeningInput({ onSubmit, disabled }: Props) {
  const [value, setValue] = useState("");
  const [isComposing, setIsComposing] = useState(false);

  const handleSubmit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSubmit(text);
    setValue("");
  };

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="flex items-center gap-2 rounded-full border border-stone-200 
                      bg-white/80 backdrop-blur-sm px-4 py-2.5 
                      focus-within:border-stone-300 transition-colors shadow-sm">
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey && !isComposing) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="说点什么..."
          disabled={disabled}
          className="flex-1 bg-transparent text-[15px] text-stone-800 
                     placeholder:text-stone-400 outline-none"
        />
        {value.trim() && (
          <button
            onClick={handleSubmit}
            disabled={disabled}
            className="flex h-7 w-7 shrink-0 items-center justify-center 
                       rounded-full bg-stone-800 text-white transition-transform 
                       hover:scale-105 active:scale-95 disabled:opacity-50"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
