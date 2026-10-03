import { defineAddon } from '@moonwitness/orm';
import { RefreshToken } from './refresh-token.js';

export const manifest = defineAddon({
  name: 'auth',
  version: '1.0.0',
  depends: ['base'],
  models: [RefreshToken],
});
