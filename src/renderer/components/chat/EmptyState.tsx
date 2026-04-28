import zoraLogoUrl from "../../assets/logo_03.png";

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) {
    return "早上好";
  }

  if (hour < 18) {
    return "下午好";
  }

  return "晚上好";
}

function ZoraLogoIcon() {
  return (
    <img
      src={zoraLogoUrl}
      alt=""
      className="h-12 w-12 shrink-0 object-contain"
      aria-hidden="true"
      draggable={false}
    />
  );
}

/**
 * 空状态组件
 * 当没有消息时显示的提示界面
 */
export function EmptyState() {
  const greeting = getGreeting();

  return (
    <div className="text-center">
      <div className="mx-auto max-w-[34rem]">
        <h2 className="flex items-center justify-center gap-3 text-[28px] font-semibold leading-tight tracking-normal text-stone-900 sm:text-[32px]">
          <ZoraLogoIcon />
          <span>{greeting}，有活我来干~</span>
        </h2>
      </div>
    </div>
  );
}
