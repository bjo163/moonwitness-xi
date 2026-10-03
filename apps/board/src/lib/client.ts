import { MoonWitnessClient } from '@moonwitness/client';

/**
 * Single SDK instance. In dev the Vite proxy makes the API same-origin; set
 * VITE_API_URL when the board is deployed on a different origin than the API.
 */
export const client = new MoonWitnessClient({
  baseUrl: import.meta.env.VITE_API_URL ?? window.location.origin,
  storageKey: 'mw-board-session',
});
