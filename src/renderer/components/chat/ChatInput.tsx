import { useRef, useEffect } from "react";
import { useAtom } from "jotai";
import { draftAtom, isRunningAtom } from "../../store/chat";
import { Button } from "../ui/Button";
import { PermissionModeButton } from "./PermissionModeButton";

export interface ChatInputProps {
  onSubmit: () => void;
  onStop: () => void;
}

/**
 * 聊天输入框组件
 * 包含自动调整高度的输入框、发送按钮和停止按钮
 */
export function ChatInput({ onSubmit, onStop }: ChatInputProps) {
  const [draft, setDraft] = useAtom(draftAtom);
  const [isRunning] = useAtom(isRunningAtom);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  const handleInput = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 180)}px`; // Max height around ~25vh
    }
  };

  useEffect(() => {
    handleInput();
  }, [draft]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="relative flex flex-col rounded-[24px] border border-stone-200 bg-white p-3 shadow-[0_2px_12px_rgba(0,0,0,0.04)] focus-within:border-stone-300 focus-within:shadow-[0_4px_24px_rgba(0,0,0,0.06)] transition-all">
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        placeholder="给 Zora 发消息… Enter 发送，Shift+Enter 换行"
        className="w-full resize-none border-0 bg-transparent px-2 py-1 text-[15px] leading-[1.6] text-stone-900 outline-none placeholder:text-stone-400 custom-scrollbar"
        rows={1}
        style={{ minHeight: "26px", maxHeight: "180px" }}
      />

      <div className="flex items-end justify-between mt-2 px-1 pb-0.5">
        <PermissionModeButton />
        <div className="flex items-center gap-2">
          {isRunning ? (
            <Button
              variant="secondary"
              onClick={onStop}
              size="sm"
            >
              停止
            </Button>
          ) : null}
          <Button
            variant="primary"
            onClick={onSubmit}
            disabled={!draft.trim() || isRunning}
            className="px-5 shadow-sm"
            size="sm"
          >
            发送
          </Button>
        </div>
      </div>
    </div>
  );
}
