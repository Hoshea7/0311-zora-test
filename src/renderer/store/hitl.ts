import { atom } from "jotai";
import type { PermissionRequest, AskUserRequest } from "../../shared/zora";

// ─── Pending 队列（FIFO，先进先出） ───

export const pendingPermissionsAtom = atom<PermissionRequest[]>([]);
export const pendingAskUsersAtom = atom<AskUserRequest[]>([]);

// ─── 派生 atom：当前是否有挂起的 HITL 请求 ───

export const hasHitlPendingAtom = atom((get) => {
  return get(pendingPermissionsAtom).length > 0 || get(pendingAskUsersAtom).length > 0;
});

// ─── Actions ───

/** 推入一个权限请求 */
export const pushPermissionAtom = atom(
  null,
  (_get, set, request: PermissionRequest) => {
    set(pendingPermissionsAtom, (prev) => [...prev, request]);
  }
);

/** 移除已响应的权限请求 */
export const resolvePermissionAtom = atom(
  null,
  (_get, set, requestId: string) => {
    set(pendingPermissionsAtom, (prev) =>
      prev.filter((r) => r.requestId !== requestId)
    );
  }
);

/** 推入一个 AskUser 请求 */
export const pushAskUserAtom = atom(
  null,
  (_get, set, request: AskUserRequest) => {
    set(pendingAskUsersAtom, (prev) => [...prev, request]);
  }
);

/** 移除已响应的 AskUser 请求 */
export const resolveAskUserAtom = atom(
  null,
  (_get, set, requestId: string) => {
    set(pendingAskUsersAtom, (prev) =>
      prev.filter((r) => r.requestId !== requestId)
    );
  }
);

/** 会话结束时清空所有 pending */
export const clearAllHitlAtom = atom(null, (_get, set) => {
  set(pendingPermissionsAtom, []);
  set(pendingAskUsersAtom, []);
});
