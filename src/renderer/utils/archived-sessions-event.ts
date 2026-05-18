export const ARCHIVED_SESSIONS_CHANGED_EVENT = "zora:archived-sessions-changed";

export function emitArchivedSessionsChanged(): void {
  window.dispatchEvent(new CustomEvent(ARCHIVED_SESSIONS_CHANGED_EVENT));
}
