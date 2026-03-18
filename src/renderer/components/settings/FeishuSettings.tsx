import { useEffect, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import type { FeishuConfig } from "../../../shared/types/feishu";
import { feishuConfigAtom, feishuStatusAtom } from "../../store/feishu";
import { cn } from "../../utils/cn";
import { getErrorMessage } from "../../utils/message";
import { Button } from "../ui/Button";
import { VisibilityIcon } from "../ui/VisibilityIcon";

interface ConnectionFeedback {
  status: "success" | "error";
  message: string;
  botName: string | null;
}

const inputClassName = [
  "w-full rounded-[10px] border border-stone-200 bg-white px-3.5 py-2.5 text-[14px] text-stone-900",
  "outline-none transition-all placeholder:text-stone-400",
  "focus:border-stone-400 focus:ring-4 focus:ring-stone-200/50 shadow-sm",
].join(" ");

const statusMeta = {
  stopped: {
    label: "未启动",
    className: "bg-stone-100 text-stone-600 ring-stone-200/80",
  },
  starting: {
    label: "启动中",
    className: "bg-amber-50 text-amber-700 ring-amber-200/80",
  },
  running: {
    label: "运行中",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200/80",
  },
  error: {
    label: "异常",
    className: "bg-rose-50 text-rose-700 ring-rose-200/80",
  },
} as const;

function createEmptyConfig(): FeishuConfig {
  return {
    enabled: false,
    appId: "",
    appSecret: "",
    autoStart: false,
  };
}

function normalizeConfigForSave(config: FeishuConfig): FeishuConfig {
  const defaultWorkspaceId = config.defaultWorkspaceId?.trim();

  return {
    ...config,
    appId: config.appId.trim(),
    appSecret: config.appSecret.trim(),
    defaultWorkspaceId: defaultWorkspaceId ? defaultWorkspaceId : undefined,
  };
}

function getCredentialFingerprint(config: Pick<FeishuConfig, "appId" | "appSecret">): string {
  return `${config.appId.trim()}::${config.appSecret.trim()}`;
}

function isBaseConfigPersisted(
  formState: FeishuConfig,
  savedConfig: FeishuConfig | null
): boolean {
  if (!savedConfig) {
    return false;
  }

  const normalizedForm = normalizeConfigForSave(formState);
  const normalizedSaved = normalizeConfigForSave(savedConfig);

  return (
    normalizedForm.appId === normalizedSaved.appId &&
    normalizedForm.appSecret === normalizedSaved.appSecret &&
    normalizedForm.autoStart === normalizedSaved.autoStart &&
    normalizedForm.defaultWorkspaceId === normalizedSaved.defaultWorkspaceId
  );
}

function getFeishuApi() {
  const api = (
    window.zora as typeof window.zora & {
      feishu?: typeof window.zora.feishu;
    }
  ).feishu;

  if (!api) {
    throw new Error("当前应用仍在使用旧的 preload，请重启 Electron 开发进程后再试。");
  }

  return api;
}

export function FeishuSettings() {
  const savedConfig = useAtomValue(feishuConfigAtom);
  const setSavedConfig = useSetAtom(feishuConfigAtom);
  const bridgeStatus = useAtomValue(feishuStatusAtom);
  const setBridgeStatus = useSetAtom(feishuStatusAtom);

  const [formState, setFormState] = useState<FeishuConfig>(createEmptyConfig);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isTogglingEnabled, setIsTogglingEnabled] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [connectionFeedback, setConnectionFeedback] = useState<ConnectionFeedback | null>(null);

  useEffect(() => {
    let isActive = true;

    const loadConfig = async () => {
      setIsLoadingConfig(true);
      setErrorMessage(null);

      try {
        const config = await getFeishuApi().getConfig();
        if (!isActive) {
          return;
        }

        setSavedConfig(config);
        setFormState(config ?? createEmptyConfig());
        setBridgeStatus("stopped");
      } catch (error) {
        if (!isActive) {
          return;
        }

        setErrorMessage(getErrorMessage(error));
      } finally {
        if (isActive) {
          setIsLoadingConfig(false);
        }
      }
    };

    void loadConfig();

    return () => {
      isActive = false;
    };
  }, [setBridgeStatus, setSavedConfig]);

  const normalizedFormState = normalizeConfigForSave(formState);
  const hasRequiredCredentials =
    normalizedFormState.appId.length > 0 && normalizedFormState.appSecret.length > 0;
  const hasSavedCurrentConfig = isBaseConfigPersisted(formState, savedConfig);
  const currentFingerprint = getCredentialFingerprint(formState);
  const lastSuccessfulFingerprint =
    connectionFeedback?.status === "success" ? currentFingerprint : null;
  const canTestConnection = hasRequiredCredentials && !isTestingConnection && !isLoadingConfig;
  const canSaveConfig = hasRequiredCredentials && !isSaving && !isLoadingConfig;
  const canEnableBridge =
    formState.enabled ||
    (hasSavedCurrentConfig &&
      lastSuccessfulFingerprint !== null &&
      lastSuccessfulFingerprint === currentFingerprint);
  const bridgeStatusDisplay = statusMeta[bridgeStatus];

  const updateFormState = (updates: Partial<FeishuConfig>, options?: { resetFeedback?: boolean }) => {
    if (options?.resetFeedback) {
      setConnectionFeedback(null);
      setSavedMessage(null);
    }

    setErrorMessage(null);
    setFormState((current) => ({
      ...current,
      ...updates,
    }));
  };

  const persistConfig = async (nextConfig: FeishuConfig, successMessage: string) => {
    const saved = await getFeishuApi().saveConfig(normalizeConfigForSave(nextConfig));
    setSavedConfig(saved);
    setFormState(saved);
    setSavedMessage(successMessage);
    setErrorMessage(null);
    setBridgeStatus("stopped");
    return saved;
  };

  const handleSave = async () => {
    if (!hasRequiredCredentials) {
      setErrorMessage("请先填写 App ID 和 App Secret。");
      return;
    }

    setIsSaving(true);
    setSavedMessage(null);

    try {
      await persistConfig(formState, "配置已保存到本机，将在下次打开设置时自动加载。");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!canTestConnection) {
      return;
    }

    setIsTestingConnection(true);
    setSavedMessage(null);
    setErrorMessage(null);
    setConnectionFeedback(null);

    try {
      const result = await getFeishuApi().testConnection({
        appId: normalizedFormState.appId,
        appSecret: normalizedFormState.appSecret,
      });

      if (result.success) {
        setConnectionFeedback({
          status: "success",
          botName: result.botName,
          message: result.botName
            ? `连接成功，Bot: ${result.botName}`
            : "连接成功，凭证验证已通过。",
        });
        return;
      }

      setConnectionFeedback({
        status: "error",
        botName: null,
        message: result.error ?? "连接失败，请检查飞书应用凭证后重试。",
      });
    } catch (error) {
      setConnectionFeedback({
        status: "error",
        botName: null,
        message: getErrorMessage(error),
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleToggleEnabled = async () => {
    if (!canEnableBridge) {
      setErrorMessage("请先保存配置并完成一次成功的连接测试，然后再启用飞书 Bridge。");
      return;
    }

    setIsTogglingEnabled(true);
    setSavedMessage(null);

    try {
      await persistConfig(
        {
          ...formState,
          enabled: !formState.enabled,
        },
        formState.enabled ? "飞书 Bridge 已关闭。" : "飞书 Bridge 已启用。"
      );
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsTogglingEnabled(false);
    }
  };

  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 space-y-8 duration-500">
      <div className="flex flex-col gap-4 border-b border-stone-100 pb-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-[24px] font-semibold tracking-tight text-stone-900">
            飞书 Bridge
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-stone-500">
            配置飞书自建应用凭证，验证机器人连接能力，并为后续 IM Bridge 接入准备本地设置。
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium ring-1 ring-inset",
              bridgeStatusDisplay.className
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
            Bridge {bridgeStatusDisplay.label}
          </span>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-3 py-1 text-[12px] font-medium ring-1 ring-inset",
              savedConfig
                ? "bg-stone-100 text-stone-700 ring-stone-200/80"
                : "bg-stone-50 text-stone-500 ring-stone-200/70"
            )}
          >
            {savedConfig ? "已保存配置" : "未保存"}
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.95fr)]">
        <div className="overflow-hidden rounded-[16px] border border-stone-200 bg-white shadow-sm ring-1 ring-black/5">
          <div className="border-b border-stone-100 px-6 py-5">
            <h3 className="text-[16px] font-semibold text-stone-900">应用凭证</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-stone-500">
              App Secret 仅保存在本机，并在写入 `~/.zora/feishu.json` 时使用 safeStorage
              加密。
            </p>
          </div>

          <div className="space-y-5 px-6 py-6">
            {isLoadingConfig ? (
              <div className="flex items-center gap-3 rounded-[12px] border border-stone-200 bg-stone-50/60 px-4 py-3 text-[13px] text-stone-500">
                <svg className="h-4 w-4 animate-spin text-stone-400" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                正在读取本地飞书配置…
              </div>
            ) : null}

            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-stone-700">App ID</span>
              <input
                className={inputClassName}
                value={formState.appId}
                onChange={(event) =>
                  updateFormState(
                    {
                      appId: event.target.value,
                    },
                    { resetFeedback: true }
                  )
                }
                placeholder="cli_a1b2c3d4..."
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-stone-700">
                App Secret
              </span>
              <div className="relative">
                <input
                  type={showSecret ? "text" : "password"}
                  className={`${inputClassName} pr-10`}
                  value={formState.appSecret}
                  onChange={(event) =>
                    updateFormState(
                      {
                        appSecret: event.target.value,
                      },
                      { resetFeedback: true }
                    )
                  }
                  placeholder="请输入飞书应用密钥"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((current) => !current)}
                  className="absolute inset-y-0 right-3 flex items-center text-stone-400 transition hover:text-stone-700"
                >
                  <VisibilityIcon visible={showSecret} />
                </button>
              </div>
            </label>

            <div className="flex flex-col gap-3 rounded-[14px] border border-stone-200 bg-stone-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[13px] font-medium text-stone-800">连接测试</p>
                <p className="mt-1 text-[12px] leading-relaxed text-stone-500">
                  使用当前表单中的 App ID 和 App Secret 请求飞书开放平台，验证凭证是否可用。
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!canTestConnection || isSaving}
                onClick={() => {
                  void handleTestConnection();
                }}
                className="min-w-[108px] justify-center"
              >
                {isTestingConnection ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    测试中…
                  </span>
                ) : (
                  "测试连接"
                )}
              </Button>
            </div>

            {connectionFeedback ? (
              <div
                className={cn(
                  "flex items-start gap-2.5 rounded-[10px] px-4 py-3 text-[13px] ring-1 ring-inset",
                  connectionFeedback.status === "success"
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                    : "bg-rose-50 text-rose-700 ring-rose-200"
                )}
              >
                {connectionFeedback.status === "success" ? (
                  <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                <p className="font-medium">{connectionFeedback.message}</p>
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-3 border-t border-stone-100 pt-5">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setFormState(savedConfig ?? createEmptyConfig());
                  setConnectionFeedback(null);
                  setSavedMessage(null);
                  setErrorMessage(null);
                }}
                disabled={isSaving || isLoadingConfig}
              >
                重置
              </Button>
              <Button
                type="button"
                onClick={() => {
                  void handleSave();
                }}
                disabled={!canSaveConfig}
                className="min-w-[96px]"
              >
                {isSaving ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    保存中
                  </span>
                ) : (
                  "保存配置"
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="overflow-hidden rounded-[16px] border border-stone-200 bg-white shadow-sm ring-1 ring-black/5">
            <div className="border-b border-stone-100 px-5 py-4">
              <h3 className="text-[16px] font-semibold text-stone-900">Bridge 开关</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-stone-500">
                仅在当前凭证已保存并通过测试后才能启用，避免无效配置自动进入后续流程。
              </p>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[14px] font-medium text-stone-900">启用飞书 Bridge</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-stone-500">
                    当前步骤只保存配置，不会真正启动 WSClient。运行时生命周期会在下一步接入。
                  </p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={formState.enabled}
                  disabled={isTogglingEnabled || !canEnableBridge}
                  onClick={() => {
                    void handleToggleEnabled();
                  }}
                  className={cn(
                    "relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors duration-200",
                    formState.enabled ? "bg-stone-900" : "bg-stone-300",
                    !canEnableBridge || isTogglingEnabled
                      ? "cursor-not-allowed opacity-50"
                      : "cursor-pointer"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1 inline-flex h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200",
                      formState.enabled ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>

              <div className="rounded-[12px] border border-stone-200 bg-stone-50/60 p-4 text-[12px] leading-relaxed text-stone-600">
                {formState.enabled
                  ? "Bridge 配置当前处于启用状态，但尚未在本步骤真正连接飞书长链路。"
                  : hasSavedCurrentConfig && connectionFeedback?.status === "success"
                    ? "当前凭证已经保存并验证通过，现在可以启用飞书 Bridge。"
                    : "请先保存配置，然后使用“测试连接”确认凭证有效，之后才能启用飞书 Bridge。"}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-[16px] border border-stone-200 bg-white shadow-sm ring-1 ring-black/5">
            <div className="border-b border-stone-100 px-5 py-4">
              <h3 className="text-[16px] font-semibold text-stone-900">当前摘要</h3>
            </div>
            <dl className="space-y-3 px-5 py-5 text-[13px] text-stone-600">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-stone-500">凭证状态</dt>
                <dd className="font-medium text-stone-900">
                  {hasRequiredCredentials ? "已填写" : "待补充"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-stone-500">配置持久化</dt>
                <dd className="font-medium text-stone-900">
                  {hasSavedCurrentConfig ? "当前表单已保存" : savedConfig ? "有未保存修改" : "尚未保存"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-stone-500">最近测试结果</dt>
                <dd
                  className={cn(
                    "font-medium",
                    connectionFeedback?.status === "success"
                      ? "text-emerald-700"
                      : connectionFeedback?.status === "error"
                        ? "text-rose-700"
                        : "text-stone-900"
                  )}
                >
                  {connectionFeedback?.status === "success"
                    ? connectionFeedback.botName
                      ? `通过 · ${connectionFeedback.botName}`
                      : "通过"
                    : connectionFeedback?.status === "error"
                      ? "失败"
                      : "未测试"}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {savedMessage ? (
        <div className="flex items-start gap-2.5 rounded-[10px] bg-emerald-50 px-4 py-3 text-[13px] text-emerald-700 ring-1 ring-inset ring-emerald-200">
          <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
          </svg>
          <p className="font-medium">{savedMessage}</p>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="flex items-start gap-2.5 rounded-[10px] bg-rose-50 px-4 py-3 text-[13px] text-rose-700 ring-1 ring-inset ring-rose-200">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="font-medium">{errorMessage}</p>
        </div>
      ) : null}
    </section>
  );
}
