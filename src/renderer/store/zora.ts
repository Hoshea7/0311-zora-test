import { atom } from "jotai";
import type { AppPhase } from "../../shared/zora";

// Core state
export const appPhaseAtom = atom<AppPhase>("splash");
export const isAwakenedAtom = atom<boolean | null>(null);

// Write atom: check awakening status via IPC
export const checkAwakeningAtom = atom(null, async (_get, set) => {
  try {
    const awakened = await window.zora.isAwakened();
    set(isAwakenedAtom, awakened);
    set(appPhaseAtom, awakened ? "chat" : "awakening-visual");
  } catch (error) {
    console.error("[zora] Failed to check awakening status, defaulting to awakening:", error);
    set(isAwakenedAtom, false);
    set(appPhaseAtom, "awakening-visual");
  }
});

// Write atom: transition from awakening to chat
export const completeAwakeningAtom = atom(null, (_get, set) => {
  set(isAwakenedAtom, true);
  set(appPhaseAtom, "awakening-complete");
});
