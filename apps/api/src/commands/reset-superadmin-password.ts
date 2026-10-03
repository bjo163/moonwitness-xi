import { manifest as authAddon } from '@moonwitness/auth';
import { installAddons } from '@moonwitness/orm';
import { manifest as baseAddon, resetSuperadminPassword } from '@moonwitness/orm-base';
import { config } from '../config/env.js';
import { createDatabase } from '../database/knex.js';

async function main(): Promise<void> {
  const password = config.superadminPassword;
  if (!password) {
    throw new Error('Set SUPERADMIN_PASSWORD in the repository .env before running this command');
  }

  const db = createDatabase();
  try {
    await installAddons(db, [baseAddon, authAddon]);
    await resetSuperadminPassword(password);
  } finally {
    await db.destroy();
  }
}

main()
  .then(() => {
    console.info('Superadmin password reset successfully.');
  })
  .catch(() => {
    console.error(
      'Superadmin password reset failed. Check SUPERADMIN_PASSWORD and database setup.'
    );
    process.exitCode = 1;
  });
