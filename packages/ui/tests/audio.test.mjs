import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  persistSoundPreference,
  playCatalogSound,
  readSoundPreference,
  SOUND_PREFERENCE_KEY,
} from '../dist/lib/audio-runtime.js';

test('sound preference defaults to muted and persists explicit user choice', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };

  assert.equal(readSoundPreference(storage), false);
  persistSoundPreference(storage, true);
  assert.equal(readSoundPreference(storage), true);
  assert.equal(values.get(SOUND_PREFERENCE_KEY), 'true');
  persistSoundPreference(storage, false);
  assert.equal(readSoundPreference(storage), false);
});

test('sound preference storage failures fall back without breaking UI actions', () => {
  const storage = {
    getItem() {
      throw new Error('storage disabled');
    },
    setItem() {
      throw new Error('storage disabled');
    },
  };

  assert.equal(readSoundPreference(storage), false);
  assert.doesNotThrow(() => persistSoundPreference(storage, false));
});

test('sound files are created only for enabled playback after first interaction', () => {
  const created = [];
  const createAudio = (source) => {
    const audio = {
      preload: '',
      volume: 1,
      play: () => Promise.resolve(),
    };
    created.push({ source, audio });
    return audio;
  };

  playCatalogSound('success', true, false, createAudio);
  playCatalogSound('alert', false, true, createAudio);
  assert.equal(created.length, 0);

  playCatalogSound('signal', true, true, createAudio);
  assert.equal(created.length, 1);
  assert.equal(created[0].source, '/sounds/ui-signal.wav');
  assert.equal(created[0].audio.preload, 'none');
  assert.equal(created[0].audio.volume, 0.32);
});

test('audio creation and playback failures never escape into product actions', async () => {
  assert.doesNotThrow(() =>
    playCatalogSound('success', true, true, () => {
      throw new Error('audio unavailable');
    })
  );
  assert.doesNotThrow(() =>
    playCatalogSound('success', true, true, () => ({
      preload: '',
      volume: 1,
      play: () => Promise.reject(new Error('playback blocked')),
    }))
  );
  await Promise.resolve();
});
