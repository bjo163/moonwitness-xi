const DEVELOPMENT_MODE_KEY = 'mw-board-development-mode';
export const DEVELOPMENT_MODE_EVENT = 'mw-board-development-mode-change';

export function readDevelopmentMode(): boolean {
  try {
    return window.localStorage.getItem(DEVELOPMENT_MODE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function updateDevelopmentMode(enabled: boolean): void {
  try {
    window.localStorage.setItem(DEVELOPMENT_MODE_KEY, String(enabled));
  } catch {
    // Keep the current session usable when storage is disabled.
  }
  window.dispatchEvent(new CustomEvent<boolean>(DEVELOPMENT_MODE_EVENT, { detail: enabled }));
}
