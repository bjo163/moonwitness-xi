export interface BoardPreferences {
  theme: 'light' | 'dark';
  language: string;
  timezone: string;
}

const PREFERENCES_KEY = 'mw-board-preferences';

export const DEFAULT_PREFERENCES: BoardPreferences = {
  theme: 'light',
  language: 'en-US',
  timezone: 'UTC',
};

export function readPreferences(): BoardPreferences {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(PREFERENCES_KEY) ?? 'null');
    if (typeof value !== 'object' || value === null) {
      return {
        ...DEFAULT_PREFERENCES,
        theme: window.localStorage.getItem('mw-theme') === 'dark' ? 'dark' : 'light',
      };
    }
    const stored = value as Partial<BoardPreferences>;
    return {
      theme: stored.theme === 'dark' ? 'dark' : 'light',
      language:
        typeof stored.language === 'string' ? stored.language : DEFAULT_PREFERENCES.language,
      timezone:
        typeof stored.timezone === 'string' ? stored.timezone : DEFAULT_PREFERENCES.timezone,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(preferences: BoardPreferences): void {
  window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  window.localStorage.setItem('mw-theme', preferences.theme);
  document.documentElement.classList.toggle('dark', preferences.theme === 'dark');
}
