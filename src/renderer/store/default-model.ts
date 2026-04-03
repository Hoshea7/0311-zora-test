import { atom } from "jotai";
import type { DefaultModelSettings } from "../../shared/types/default-model";

export const defaultModelSettingsAtom = atom<DefaultModelSettings | null>(null);

export const loadDefaultModelSettingsAtom = atom(null, async (_get, set) => {
  const settings = await window.zora.defaultModel.getSettings();
  set(defaultModelSettingsAtom, settings);
  return settings;
});

export const updateDefaultModelSettingsAtom = atom(
  null,
  async (_get, set, patch: Partial<DefaultModelSettings>) => {
    const settings = await window.zora.defaultModel.updateSettings(patch);
    set(defaultModelSettingsAtom, settings);
    return settings;
  }
);
