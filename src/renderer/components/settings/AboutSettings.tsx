import { useEffect, useMemo, useState } from "react";
import type { UpdateStatus } from "../../../shared/types/updater";
import { cn } from "../../utils/cn";
import { getErrorMessage } from "../../utils/message";
import { Button } from "../ui/Button";

const PROJECT_URL = "https://github.com/Hoshea7/ZoraAgent";

const statusMeta: Record<
  UpdateStatus["state"],
  { label: string; textClassName: string; description: string }
> = {
  unsupported: {
    label: "当前不可用",
    textClassName: "text-stone-500",
    description: "仅打包后的正式版本支持应用内更新。",
  },
  idle: {
    label: "未检查",
    textClassName: "text-stone-500",
    description: "可以手动检查新版本。",
  },
  checking: {
    label: "检查中…",
    textClassName: "text-amber-600",
    description: "正在连接 GitHub Release 检查新版本。",
  },
  available: {
    label: "发现更新",
    textClassName: "text-emerald-600",
    description: "已经发现新版本，可以开始下载。",
  },
  "not-available": {
    label: "已是最新",
    textClassName: "text-emerald-600",
    description: "当前版本已经是最新版本。",
  },
  downloading: {
    label: "下载中",
    textClassName: "text-sky-600",
    description: "更新包正在下载，下载完成后可直接安装。",
  },
  downloaded: {
    label: "可安装",
    textClassName: "text-emerald-600",
    description: "更新已下载完成，点击安装后会重启应用。",
  },
  installing: {
    label: "安装中",
    textClassName: "text-rose-600",
    description: "应用正在退出并安装更新，请稍候。",
  },
  error: {
    label: "更新失败",
    textClassName: "text-rose-600",
    description: "更新过程中出现错误，可以稍后重试。",
  },
};

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 100 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function getUpdaterApi() {
  return window.zora?.updater ?? null;
}

function Row({
  label,
  description,
  value,
}: {
  label: string;
  description?: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[72px] items-center justify-between gap-6 border-t border-stone-200/80 px-5 py-4 first:border-t-0">
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-stone-900">{label}</p>
        {description ? (
          <p className="mt-1 text-[13px] leading-5 text-stone-500">{description}</p>
        ) : null}
      </div>
      <div className="min-w-0 shrink-0 text-right text-[15px] text-stone-600">{value}</div>
    </div>
  );
}

export function AboutSettings() {
  const [appVersion, setAppVersion] = useState("—");
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    const updaterApi = getUpdaterApi();

    const loadVersion = async () => {
      try {
        const version = await window.zora.getAppVersion();
        if (isActive) {
          setAppVersion(version);
        }
      } catch (error) {
        if (isActive) {
          setActionError((current) => current ?? getErrorMessage(error));
        }
      }
    };

    void loadVersion();

    if (!updaterApi) {
      setStatus({
        state: "unsupported",
        supported: false,
        currentVersion: appVersion,
        message: "当前运行中的应用尚未加载更新模块，请重启应用后再试。",
        error: "未检测到 window.zora.updater 接口。",
      });
      setIsLoading(false);
      return undefined;
    }

    const hydrateStatus = async () => {
      try {
        const nextStatus = await updaterApi.getStatus();
        if (!isActive) {
          return;
        }
        setStatus(nextStatus);
      } catch (error) {
        if (!isActive) {
          return;
        }
        setActionError(getErrorMessage(error));
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    const unsubscribe = updaterApi.onStatusChanged((nextStatus) => {
      if (!isActive) {
        return;
      }

      setStatus(nextStatus);
      setActionError(null);
      setIsLoading(false);
    });

    void hydrateStatus();

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, []);

  const effectiveStatus = useMemo<UpdateStatus>(() => {
    return (
      status ?? {
        state: "idle",
        supported: false,
        currentVersion: appVersion,
        message: "正在读取更新状态…",
      }
    );
  }, [appVersion, status]);

  const meta = statusMeta[effectiveStatus.state];
  const progress = effectiveStatus.progress;
  const isBusy =
    effectiveStatus.state === "checking" ||
    effectiveStatus.state === "downloading" ||
    effectiveStatus.state === "installing";

  const handleCheck = async () => {
    const updaterApi = getUpdaterApi();
    if (!updaterApi) {
      setActionError("当前运行中的应用尚未加载更新模块，请重启应用后再试。");
      return;
    }

    setActionError(null);
    try {
      await updaterApi.checkForUpdates();
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  };

  const handleDownload = async () => {
    const updaterApi = getUpdaterApi();
    if (!updaterApi) {
      setActionError("当前运行中的应用尚未加载更新模块，请重启应用后再试。");
      return;
    }

    setActionError(null);
    try {
      await updaterApi.downloadUpdate();
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  };

  const handleInstall = async () => {
    const updaterApi = getUpdaterApi();
    if (!updaterApi) {
      setActionError("当前运行中的应用尚未加载更新模块，请重启应用后再试。");
      return;
    }

    setActionError(null);
    try {
      await updaterApi.installUpdate();
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  };

  const handleOpenProject = async () => {
    try {
      await window.zora.openExternal(PROJECT_URL);
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  };

  const primaryUpdateAction =
    effectiveStatus.state === "available"
      ? { label: "下载更新", onClick: handleDownload, variant: "primary" as const }
      : effectiveStatus.state === "downloaded"
        ? { label: "安装并重启", onClick: handleInstall, variant: "primary" as const }
        : { label: effectiveStatus.state === "checking" ? "检查中…" : "检查更新", onClick: handleCheck, variant: "secondary" as const };

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-[24px] font-semibold tracking-tight text-stone-900">关于 Zora</h2>
        <p className="mt-2 text-[14px] leading-6 text-stone-500">
          有灵魂的桌面 AI 伴侣
        </p>
      </div>

      <div className="overflow-hidden rounded-[24px] border border-stone-200/70 bg-white shadow-sm">
        <Row label="版本" value={appVersion} />
        <Row label="运行时" value="Electron + React" />
        <Row
          label="开源协议"
          description="本项目遵循开源协议发布"
          value="MIT"
        />
        <Row
          label="项目地址"
          value={
            <button
              type="button"
              onClick={handleOpenProject}
              className="text-[15px] text-stone-700 underline decoration-stone-300 underline-offset-4 transition hover:text-stone-900"
            >
              github.com/Hoshea7/ZoraAgent
            </button>
          }
        />
      </div>

      <div className="overflow-hidden rounded-[24px] border border-stone-200/70 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-stone-900">软件更新</p>
            <p className={cn("mt-1 text-[13px] leading-5", meta.textClassName)}>
              {effectiveStatus.state === "available" && effectiveStatus.latestVersion
                ? `发现新版本 v${effectiveStatus.latestVersion}`
                : effectiveStatus.state === "downloaded" && effectiveStatus.latestVersion
                  ? `v${effectiveStatus.latestVersion} 已下载完成，可直接安装`
                  : effectiveStatus.message ?? meta.description}
            </p>
            {isLoading ? (
              <p className="mt-1 text-[12px] text-stone-400">正在读取更新状态…</p>
            ) : null}
          </div>
          <div className="shrink-0">
            <Button
              onClick={primaryUpdateAction.onClick}
              variant={primaryUpdateAction.variant}
              size="sm"
              disabled={!effectiveStatus.supported || isBusy}
            >
              {primaryUpdateAction.label}
            </Button>
          </div>
        </div>

        {progress ? (
          <div className="border-t border-stone-200/80 px-5 py-4">
            <div className="flex items-center justify-between gap-4 text-[13px] text-sky-700">
              <span>下载进度</span>
              <span>{progress.percent.toFixed(1)}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-sky-100">
              <div
                className="h-full rounded-full bg-sky-500 transition-all duration-300"
                style={{ width: `${Math.max(4, Math.min(progress.percent, 100))}%` }}
              />
            </div>
            <p className="mt-3 text-[13px] text-sky-700">
              已下载 {formatBytes(progress.transferred)} / {formatBytes(progress.total)}
            </p>
          </div>
        ) : null}
      </div>

      {actionError || effectiveStatus.error ? (
        <div className="rounded-[24px] border border-rose-200 bg-rose-50/80 px-5 py-4 text-[14px] text-rose-700 shadow-sm">
          {actionError ?? effectiveStatus.error}
        </div>
      ) : null}
    </section>
  );
}
