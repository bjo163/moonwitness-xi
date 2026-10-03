import { defineAddon } from '@moonwitness/orm';
import { Partner } from './models/partner.js';
import { User } from './models/user.js';
import { data } from './data.js';

export const manifest = defineAddon({
  name: 'base',
  version: '1.0.0',
  models: [Partner, User],
  data,
});
