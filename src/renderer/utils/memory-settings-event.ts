import type { MemorySettings } from "../../shared/types/memory";

export const MEMORY_SETTINGS_UPDATED_EVENT = "zora:memory-settings-updated";

export function emitMemorySettingsUpdated(settings: MemorySettings): void {
  window.dispatchEvent(
    new CustomEvent<MemorySettings>(MEMORY_SETTINGS_UPDATED_EVENT, {
      detail: settings,
    })
  );
}
