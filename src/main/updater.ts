import { app, BrowserWindow, shell } from "electron";
import { autoUpdater } from "electron-updater";
import type { ProgressInfo, UpdateInfo } from "builder-util-runtime";
import type { UpdateInstallMode, UpdateStatus } from "../shared/types/updater";

const UPDATER_STATUS_CHANNEL = "updater:status";
const STARTUP_CHECK_DELAY_MS = 15_000;
const PERIODIC_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const RELEASES_URL = "https://github.com/Hoshea7/ZoraAgent/releases";
const LATEST_RELEASE_API_URL = "https://api.github.com/repos/Hoshea7/ZoraAgent/releases/latest";

interface GitHubLatestRelease {
  tag_name?: string;
  name?: string;
  body?: string;
  html_url?: string;
}

let currentStatus: UpdateStatus = createBaseStatus({
  state: "idle",
  supported: app.isPackaged,
  message: app.isPackaged ? "可检查新版本" : "仅打包后的正式版本支持应用内更新。",
});
let initialized = false;
let startupCheckTimer: ReturnType<typeof setTimeout> | null = null;
let periodicCheckTimer: ReturnType<typeof setInterval> | null = null;
let installingUpdate = false;

function createBaseStatus(partial: Partial<UpdateStatus>): UpdateStatus {
  return {
    state: partial.state ?? "idle",
    supported: partial.supported ?? app.isPackaged,
    installMode: partial.installMode ?? getUpdateInstallModeForPlatform(),
    currentVersion: app.getVersion(),
    latestVersion: partial.latestVersion,
    releaseNotes: partial.releaseNotes,
    manualUpdateUrl: partial.manualUpdateUrl,
    progress: partial.progress,
    checkedAt: partial.checkedAt,
    message: partial.message,
    error: partial.error,
  };
}

export function getUpdateInstallModeForPlatform(
  platform: NodeJS.Platform = process.platform
): UpdateInstallMode {
  return platform === "win32" ? "automatic" : "manual";
}

export function getManualUpdateUrl(version?: string): string {
  if (!version) {
    return RELEASES_URL;
  }

  const tag = version.startsWith("v") ? version : `v${version}`;
  return `${RELEASES_URL}/tag/${encodeURIComponent(tag)}`;
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, "");
}

function parseVersionParts(version: string): number[] {
  const normalized = normalizeVersion(version);
  const core = normalized.split("-", 1)[0] ?? "";
  return core.split(".").map((part) => {
    const parsed = Number.parseInt(part, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });
}

export function isNewerVersion(latestVersion: string, currentVersion: string): boolean {
  const latestParts = parseVersionParts(latestVersion);
  const currentParts = parseVersionParts(currentVersion);
  const maxLength = Math.max(latestParts.length, currentParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const latestPart = latestParts[index] ?? 0;
    const currentPart = currentParts[index] ?? 0;

    if (latestPart > currentPart) {
      return true;
    }

    if (latestPart < currentPart) {
      return false;
    }
  }

  return false;
}

function getInstallMode(): UpdateInstallMode {
  return getUpdateInstallModeForPlatform();
}

function isManualInstallMode(): boolean {
  return getInstallMode() === "manual";
}

function normalizeReleaseNotes(releaseNotes: UpdateInfo["releaseNotes"]): string | undefined {
  if (typeof releaseNotes === "string") {
    const trimmed = releaseNotes.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (Array.isArray(releaseNotes)) {
    const merged = releaseNotes
      .map((entry) => {
        const version = typeof entry.version === "string" ? `v${entry.version}` : "";
        const note =
          typeof entry.note === "string" ? entry.note.trim() : "";
        return [version, note].filter(Boolean).join("\n");
      })
      .filter(Boolean)
      .join("\n\n");

    return merged.length > 0 ? merged : undefined;
  }

  return undefined;
}

function broadcastStatus(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(UPDATER_STATUS_CHANNEL, currentStatus);
    }
  }
}

function setStatus(next: Partial<UpdateStatus>): UpdateStatus {
  currentStatus = createBaseStatus({
    ...currentStatus,
    ...next,
    currentVersion: app.getVersion(),
  });
  broadcastStatus();
  return currentStatus;
}

function setUpdateErrorState(message: string, error: unknown): UpdateStatus {
  installingUpdate = false;

  return setStatus({
    state: "error",
    supported: app.isPackaged,
    manualUpdateUrl: undefined,
    message,
    error: error instanceof Error ? error.message : String(error),
    checkedAt: new Date().toISOString(),
    progress: undefined,
  });
}

function isBusyState(state: UpdateStatus["state"]): boolean {
  return state === "checking" || state === "downloading" || state === "installing";
}

function ensureSupported(): void {
  if (app.isPackaged) {
    return;
  }

  setStatus({
    state: "unsupported",
    supported: false,
    manualUpdateUrl: undefined,
    message: "仅打包后的正式版本支持应用内更新。",
  });
  throw new Error("Auto update is only available in packaged builds.");
}

function configureAutoUpdaterEvents(): void {
  const installMode = getInstallMode();

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = installMode === "automatic";
  autoUpdater.logger = {
    info: (...args: unknown[]) => console.log("[updater]", ...args),
    warn: (...args: unknown[]) => console.warn("[updater]", ...args),
    error: (...args: unknown[]) => console.error("[updater]", ...args),
    debug: (...args: unknown[]) => console.debug("[updater:debug]", ...args),
  };

  autoUpdater.on("checking-for-update", () => {
    setStatus({
      state: "checking",
      supported: true,
      installMode,
      message: "正在检查更新…",
      error: undefined,
      checkedAt: new Date().toISOString(),
      progress: undefined,
      manualUpdateUrl: undefined,
    });
  });

  autoUpdater.on("update-available", (info) => {
    const manualUpdateUrl = installMode === "manual" ? getManualUpdateUrl(info.version) : undefined;

    setStatus({
      state: "available",
      supported: true,
      installMode,
      latestVersion: info.version,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
      manualUpdateUrl,
      checkedAt: new Date().toISOString(),
      message:
        installMode === "manual"
          ? `发现新版本 v${info.version}，请前往下载页面手动安装。`
          : `发现新版本 v${info.version}`,
      error: undefined,
      progress: undefined,
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    setStatus({
      state: "not-available",
      supported: true,
      installMode,
      latestVersion: info?.version ?? app.getVersion(),
      checkedAt: new Date().toISOString(),
      message: "当前已经是最新版本。",
      error: undefined,
      progress: undefined,
      manualUpdateUrl: undefined,
    });
  });

  autoUpdater.on("download-progress", (progress: ProgressInfo) => {
    setStatus({
      state: "downloading",
      supported: true,
      installMode,
      progress: {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond,
      },
      message: `正在下载更新 ${progress.percent.toFixed(1)}%`,
      error: undefined,
      manualUpdateUrl: undefined,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    setStatus({
      state: "downloaded",
      supported: true,
      installMode,
      latestVersion: info.version,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
      checkedAt: new Date().toISOString(),
      message: "更新已下载完成，准备安装。",
      error: undefined,
      progress: undefined,
      manualUpdateUrl: undefined,
    });
  });

  autoUpdater.on("error", (error) => {
    if (installingUpdate) {
      console.error("[updater] Install flow failed:", error);
      setUpdateErrorState("安装更新失败，请稍后重试。", error);
      return;
    }

    setUpdateErrorState("更新失败，请稍后重试。", error);
  });
}

async function checkManualUpdatesFromGitHub(): Promise<UpdateStatus> {
  setStatus({
    state: "checking",
    supported: true,
    installMode: "manual",
    message: "正在检查更新…",
    error: undefined,
    checkedAt: new Date().toISOString(),
    progress: undefined,
    manualUpdateUrl: undefined,
  });

  try {
    const response = await fetch(LATEST_RELEASE_API_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "ZoraUpdater",
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub Releases 请求失败：${response.status} ${response.statusText}`);
    }

    const release = (await response.json()) as GitHubLatestRelease;
    const latestVersion = normalizeVersion(release.tag_name ?? release.name ?? "");

    if (!latestVersion) {
      throw new Error("GitHub Release 中缺少版本号。");
    }

    if (isNewerVersion(latestVersion, app.getVersion())) {
      return setStatus({
        state: "available",
        supported: true,
        installMode: "manual",
        latestVersion,
        releaseNotes: release.body?.trim() || undefined,
        manualUpdateUrl: release.html_url || getManualUpdateUrl(latestVersion),
        checkedAt: new Date().toISOString(),
        message: `发现新版本 v${latestVersion}，请前往下载页面手动安装。`,
        error: undefined,
        progress: undefined,
      });
    }

    return setStatus({
      state: "not-available",
      supported: true,
      installMode: "manual",
      latestVersion,
      checkedAt: new Date().toISOString(),
      message: "当前已经是最新版本。",
      error: undefined,
      progress: undefined,
      manualUpdateUrl: undefined,
    });
  } catch (error) {
    return setUpdateErrorState("检查更新失败，请稍后重试。", error);
  }
}

function scheduleAutomaticChecks(): void {
  if (!app.isPackaged) {
    return;
  }

  startupCheckTimer = setTimeout(() => {
    void checkForUpdates();
  }, STARTUP_CHECK_DELAY_MS);

  periodicCheckTimer = setInterval(() => {
    void checkForUpdates();
  }, PERIODIC_CHECK_INTERVAL_MS);
}

export function initAutoUpdater(): void {
  if (initialized) {
    broadcastStatus();
    return;
  }

  initialized = true;

  if (!app.isPackaged) {
    setStatus({
      state: "unsupported",
      supported: false,
      manualUpdateUrl: undefined,
      message: "仅打包后的正式版本支持应用内更新。",
    });
    return;
  }

  configureAutoUpdaterEvents();
  scheduleAutomaticChecks();
  setStatus({
    state: "idle",
    supported: true,
    installMode: getInstallMode(),
    message: "可检查新版本",
    error: undefined,
    manualUpdateUrl: undefined,
  });
}

export function getUpdateStatus(): UpdateStatus {
  return currentStatus;
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  ensureSupported();

  if (isBusyState(currentStatus.state)) {
    return currentStatus;
  }

  if (isManualInstallMode()) {
    return checkManualUpdatesFromGitHub();
  }

  await autoUpdater.checkForUpdates();
  return currentStatus;
}

export async function downloadUpdate(): Promise<UpdateStatus> {
  ensureSupported();

  if (currentStatus.state !== "available") {
    throw new Error("当前没有可下载的更新。");
  }

  if (isManualInstallMode()) {
    await shell.openExternal(currentStatus.manualUpdateUrl ?? getManualUpdateUrl(currentStatus.latestVersion));
    return currentStatus;
  }

  await autoUpdater.downloadUpdate();
  return currentStatus;
}

export function installUpdate(): void {
  ensureSupported();

  if (isManualInstallMode()) {
    throw new Error("当前平台需要前往下载页面手动安装更新。");
  }

  if (currentStatus.state !== "downloaded") {
    throw new Error("更新尚未下载完成，无法安装。");
  }

  try {
    installingUpdate = true;
    setStatus({
      state: "installing",
      supported: true,
      message: "正在退出并安装更新…",
      error: undefined,
    });
    autoUpdater.quitAndInstall(true, true);
  } catch (error) {
    setUpdateErrorState("安装更新失败，请稍后重试。", error);
    throw error;
  }
}

export function isInstallingUpdate(): boolean {
  return installingUpdate;
}

export function cleanupAutoUpdater(): void {
  if (startupCheckTimer) {
    clearTimeout(startupCheckTimer);
    startupCheckTimer = null;
  }

  if (periodicCheckTimer) {
    clearInterval(periodicCheckTimer);
    periodicCheckTimer = null;
  }
}

export { UPDATER_STATUS_CHANNEL };
