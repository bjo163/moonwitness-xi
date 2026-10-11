export interface BoardPreferences {
  theme: 'light' | 'dark';
  language: string;
  timezone: string;
}

const PREFERENCES_KEY = 'mw-board-preferences';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSupportedLanguage(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  try {
    return Intl.getCanonicalLocales(value).length === 1;
  } catch {
    return false;
  }
}

function isSupportedTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const DEFAULT_PREFERENCES: BoardPreferences = {
  theme: 'light',
  language: 'en-US',
  timezone: 'UTC',
};

export function readPreferences(): BoardPreferences {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(PREFERENCES_KEY) ?? 'null');
    if (!isRecord(value)) {
      return {
        ...DEFAULT_PREFERENCES,
        theme: window.localStorage.getItem('mw-theme') === 'dark' ? 'dark' : 'light',
      };
    }
    return {
      theme: value.theme === 'dark' ? 'dark' : 'light',
      language: isSupportedLanguage(value.language) ? value.language : DEFAULT_PREFERENCES.language,
      timezone: isSupportedTimezone(value.timezone) ? value.timezone : DEFAULT_PREFERENCES.timezone,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(preferences: BoardPreferences): void {
  window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  window.localStorage.setItem('mw-theme', preferences.theme);
  document.documentElement.lang = preferences.language;
  document.documentElement.classList.toggle('dark', preferences.theme === 'dark');
}
