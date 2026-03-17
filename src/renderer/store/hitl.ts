import { atom, type Getter } from "jotai";
import type {
  PermissionRequest,
  AskUserRequest,
  PermissionMode,
} from "../../shared/zora";
import { currentSessionIdAtom } from "./workspace";
import { appPhaseAtom } from "./zora";

type SessionId = string;
type SessionScopedQueues<T> = Record<SessionId, T[]>;
type SessionScopedPermissionRequest = PermissionRequest & { sessionId: SessionId };
type SessionScopedAskUserRequest = AskUserRequest & { sessionId: SessionId };

function resolveActiveHitlSessionId(get: Getter): SessionId {
  if (get(appPhaseAtom).startsWith("awakening")) {
    return "__awakening__";
  }

  return get(currentSessionIdAtom) ?? "__draft__";
}

function appendSessionScopedRequest<T extends { sessionId: SessionId }>(
  current: SessionScopedQueues<T>,
  request: T
): SessionScopedQueues<T> {
  return {
    ...current,
    [request.sessionId]: [...(current[request.sessionId] ?? []), request],
  };
}

function removeRequestById<T extends { requestId: string }>(
  current: SessionScopedQueues<T>,
  requestId: string
): SessionScopedQueues<T> {
  let changed = false;
  const next: SessionScopedQueues<T> = {};

  for (const [sessionId, requests] of Object.entries(current)) {
    const filtered = requests.filter((request) => request.requestId !== requestId);
    if (filtered.length !== requests.length) {
      changed = true;
    }
    if (filtered.length > 0) {
      next[sessionId] = filtered;
    }
  }

  return changed ? next : current;
}

function clearRequestsForSession<T>(
  current: SessionScopedQueues<T>,
  sessionId: SessionId
): SessionScopedQueues<T> {
  if (!(sessionId in current)) {
    return current;
  }

  const next = { ...current };
  delete next[sessionId];
  return next;
}

// ─── Pending 队列（FIFO，先进先出） ───

export const pendingPermissionsBySessionAtom = atom<
  SessionScopedQueues<SessionScopedPermissionRequest>
>({});
export const pendingAskUsersBySessionAtom = atom<
  SessionScopedQueues<SessionScopedAskUserRequest>
>({});

export const pendingPermissionsAtom = atom((get) => {
  const sessionId = resolveActiveHitlSessionId(get);
  return get(pendingPermissionsBySessionAtom)[sessionId] ?? [];
});

export const pendingAskUsersAtom = atom((get) => {
  const sessionId = resolveActiveHitlSessionId(get);
  return get(pendingAskUsersBySessionAtom)[sessionId] ?? [];
});

// ─── 派生 atom：当前是否有挂起的 HITL 请求 ───

export const hasHitlPendingAtom = atom((get) => {
  return get(pendingPermissionsAtom).length > 0 || get(pendingAskUsersAtom).length > 0;
});

// ─── Actions ───

/** 推入一个权限请求 */
export const pushPermissionAtom = atom(
  null,
  (_get, set, payload: { request: PermissionRequest; sessionId: SessionId }) => {
    const request: SessionScopedPermissionRequest = {
      ...payload.request,
      sessionId: payload.sessionId,
    };
    console.log("[renderer][hitl-store] pushPermission.", {
      requestId: request.requestId,
      toolName: request.toolName,
      sessionId: request.sessionId,
    });
    set(pendingPermissionsBySessionAtom, (prev) =>
      appendSessionScopedRequest(prev, request)
    );
  }
);

/** 移除已响应的权限请求 */
export const resolvePermissionAtom = atom(
  null,
  (_get, set, requestId: string) => {
    console.log("[renderer][hitl-store] resolvePermission.", { requestId });
    set(pendingPermissionsBySessionAtom, (prev) =>
      removeRequestById(prev, requestId)
    );
  }
);

/** 推入一个 AskUser 请求 */
export const pushAskUserAtom = atom(
  null,
  (_get, set, payload: { request: AskUserRequest; sessionId: SessionId }) => {
    const request: SessionScopedAskUserRequest = {
      ...payload.request,
      sessionId: payload.sessionId,
    };
    console.log("[renderer][hitl-store] pushAskUser.", {
      requestId: request.requestId,
      questionCount: request.questions.length,
      sessionId: request.sessionId,
    });
    set(pendingAskUsersBySessionAtom, (prev) =>
      appendSessionScopedRequest(prev, request)
    );
  }
);

/** 移除已响应的 AskUser 请求 */
export const resolveAskUserAtom = atom(
  null,
  (_get, set, requestId: string) => {
    console.log("[renderer][hitl-store] resolveAskUser.", { requestId });
    set(pendingAskUsersBySessionAtom, (prev) =>
      removeRequestById(prev, requestId)
    );
  }
);

/** 清空某个会话的 pending 请求 */
export const clearHitlForSessionAtom = atom(
  null,
  (_get, set, sessionId: SessionId) => {
    console.log("[renderer][hitl-store] clearPendingForSession.", { sessionId });
    set(pendingPermissionsBySessionAtom, (prev) =>
      clearRequestsForSession(prev, sessionId)
    );
    set(pendingAskUsersBySessionAtom, (prev) =>
      clearRequestsForSession(prev, sessionId)
    );
  }
);

/** 会话结束时清空所有 pending */
export const clearAllHitlAtom = atom(null, (_get, set) => {
  console.log("[renderer][hitl-store] clearAllPending.");
  set(pendingPermissionsBySessionAtom, {});
  set(pendingAskUsersBySessionAtom, {});
});

/** 当前会话的 Permission Mode */
export const permissionModeAtom = atom<PermissionMode>("ask");

/** 更新 Permission Mode，并同步到 Main 进程 */
export const setPermissionModeAtom = atom(
  null,
  async (_get, set, mode: PermissionMode) => {
    set(permissionModeAtom, mode);
    await window.zora.setPermissionMode(mode);
  }
);
