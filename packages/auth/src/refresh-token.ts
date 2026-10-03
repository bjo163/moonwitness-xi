import { defineModel, fields } from '@moonwitness/orm';
import { User } from '@moonwitness/orm-base';

/**
 * Server-side record of an issued refresh token. Only the SHA-256 hash of the token is
 * stored, so a database leak does not yield usable credentials. Tokens that were rotated
 * share a `family`, which lets reuse of an old token revoke the whole chain.
 */
export const RefreshToken = defineModel('auth.refresh_token', {
  table: 'auth_refresh_tokens',
  order: 'id desc',
  fields: {
    user: fields.belongsTo(User, { required: true }),
    token_hash: fields.string({ required: true, unique: true }),
    family: fields.string({ required: true }),
    /** ISO-8601 UTC timestamp; fixed-width strings compare correctly and avoid int32 limits. */
    expires_at: fields.string({ required: true }),
    rotated_at: fields.string(),
    rotation_lease_until: fields.string(),
    revoked: fields.boolean({ default: false }),
    user_agent: fields.string(),
  },
});
