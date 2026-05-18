import type { ClientLogEventInput } from "../../shared/zora";

function logClientEvent(input: ClientLogEventInput): void {
  void window.zora.logClientEvent(input).catch(() => {
    // Client diagnostics must not break the user action being diagnosed.
  });
}

export function logChatSubmitStart(fields: {
  currentSessionId: string | null;
  currentSessionExists: boolean;
  currentWorkspaceId: string;
  selectedProvider: string | null;
  selectedProviderType: string | null;
  selectedModel: string | null;
  selectionSource: "session" | "composer" | "default" | "none";
  attachmentCount: number;
  inputLength: number;
}): void {
  logClientEvent({
    area: "ui",
    component: "chat",
    event: "submit:start",
    message: "用户提交消息",
    fields,
  });
}

export function logCurrentSessionMissing(fields: {
  currentSessionId: string;
  currentWorkspaceId: string;
  inputLength: number;
  attachmentCount: number;
}): void {
  logClientEvent({
    area: "ui",
    component: "session",
    event: "current:missing",
    message: "当前会话 ID 在本地会话列表中不存在",
    level: "warn",
    fields,
  });
}

export function logSessionStateSynced(fields: {
  action: "delete";
  sessionId: string;
  workspaceId: string;
  wasCurrentSession: boolean;
  wasPinned: boolean;
}): void {
  logClientEvent({
    area: "ui",
    component: "session",
    event: "state:sync",
    message: "会话本地状态已同步",
    fields,
  });
}

export function logSessionStateSyncError(fields: {
  action: "delete";
  sessionId: string;
  workspaceId: string;
  error: string;
}): void {
  logClientEvent({
    area: "ui",
    component: "session",
    event: "state:sync:error",
    message: "会话本地状态同步后的磁盘操作失败",
    level: "error",
    fields,
  });
}
