import { atom } from "jotai";
import type { FeishuBridgeStatus, FeishuConfig } from "../../shared/types/feishu";

export const feishuConfigAtom = atom<FeishuConfig | null>(null);
export const feishuStatusAtom = atom<FeishuBridgeStatus["status"]>("stopped");
