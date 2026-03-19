/**
 * 空状态组件
 * 当没有消息时显示的提示界面
 */
export function EmptyState() {
  return (
    <div className="flex h-full min-h-[24rem] items-center justify-center p-8 text-center">
      <div className="max-w-md">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-orange-400 ring-1 ring-orange-100 shadow-sm">
          <svg
            className="h-7 w-7"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
        <h2 className="text-[26px] font-semibold tracking-tight text-stone-800">
          你好！我是 Zora
        </h2>
        <p className="mt-2.5 text-[15px] leading-relaxed text-stone-500">
          在下方输入框发送消息，即可开始对话。
        </p>
      </div>
    </div>
  );
}
