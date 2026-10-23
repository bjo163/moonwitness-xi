export type SfxName = 'success' | 'alert' | 'signal';

export const SOUND_PREFERENCE_KEY = 'mw-ui-sound-enabled';

const catalog: Record<SfxName, string> = {
  success: '/sounds/ui-success.wav',
  alert: '/sounds/ui-alert.wav',
  signal: '/sounds/ui-signal.wav',
};

type SoundStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

type AudioPlayback = {
  preload: string;
  volume: number;
  play: () => Promise<unknown>;
};

export function readSoundPreference(storage: SoundStorage): boolean {
  try {
    return storage.getItem(SOUND_PREFERENCE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function persistSoundPreference(storage: SoundStorage, enabled: boolean): void {
  try {
    storage.setItem(SOUND_PREFERENCE_KEY, String(enabled));
  } catch {
    // Preference storage may be unavailable; the in-memory control still works.
  }
}

export function playCatalogSound(
  name: SfxName,
  enabled: boolean,
  ready: boolean,
  createAudio: (source: string) => AudioPlayback
): void {
  if (!enabled || !ready) return;
  try {
    const audio = createAudio(catalog[name]);
    audio.preload = 'none';
    audio.volume = 0.32;
    void audio.play().catch(() => undefined);
  } catch {
    // Missing audio never interrupts the action.
  }
}
