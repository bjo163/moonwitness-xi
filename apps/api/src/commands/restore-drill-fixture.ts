import { chmod, readFile, writeFile } from 'node:fs/promises';
import knex, { type Knex } from 'knex';
import { createAuthService, manifest as authManifest } from '@moonwitness/auth';
import { jobsManifest } from '@moonwitness/jobs';
import { manifest as notificationManifest } from '@moonwitness/orm-notification';
import { installAddons } from '@moonwitness/orm';
import {
  Company,
  Partner,
  PartnerAddress,
  User,
  initializeSuperadminPassword,
  manifest as baseManifest,
} from '@moonwitness/orm-base';

const tableNames = [
  '_orm_addons',
  '_orm_data',
  'companies',
  'partners',
  'users',
  'partner_addresses',
  'company_memberships',
  'group_memberships',
  'notification_templates',
  'notification_preferences',
  'notifications',
] as const;
const fixture = {
  businessName: 'Restore Drill Business',
  childName: 'Restore Drill Contact',
  addressLabel: 'Restore Drill Headquarters',
  login: 'restore-drill-user',
  email: 'restore-drill-user@example.test',
} as const;

interface RestoreExpectations {
  counts: Record<(typeof tableNames)[number], string>;
  ids: {
    address: number;
    business: number;
    child: number;
    company: number;
    superadmin: number;
    system: number;
    user: number;
  };
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function countTables(db: Knex): Promise<RestoreExpectations['counts']> {
  const entries = await Promise.all(
    tableNames.map(async (table) => {
      const row = await db(table).count({ count: '*' }).first();
      return [table, String(row?.count ?? '0')] as const;
    })
  );
  return Object.fromEntries(entries) as RestoreExpectations['counts'];
}

function bindFixtureModels(db: Knex): void {
  for (const addon of [baseManifest, authManifest, jobsManifest, notificationManifest]) {
    for (const model of addon.models) model.knex(db);
  }
}

async function recordId(db: Knex, externalId: string, model: string): Promise<number> {
  const identity = await db('_orm_data').where({ id: externalId, model }).first('record_id');
  assert(identity, `Missing external identity ${externalId}`);
  return Number(identity.record_id);
}

async function recordExpectations(db: Knex): Promise<RestoreExpectations> {
  const user = await User.query().findOne({ login: fixture.login }).throwIfNotFound();
  const business = await Partner.query().findOne({ name: fixture.businessName }).throwIfNotFound();
  const child = await Partner.query().findOne({ name: fixture.childName }).throwIfNotFound();
  const address = await PartnerAddress.query()
    .findOne({ label: fixture.addressLabel })
    .throwIfNotFound();

  return {
    counts: await countTables(db),
    ids: {
      address: address.id,
      business: business.id,
      child: child.id,
      company: await recordId(db, 'base.company_default', 'base.company'),
      superadmin: await recordId(db, 'base.user_superadmin', 'base.user'),
      system: await recordId(db, 'base.user_system', 'base.user'),
      user: user.id,
    },
  };
}

async function seed(db: Knex, expectationsPath: string): Promise<void> {
  await installAddons(db, [baseManifest, authManifest, jobsManifest, notificationManifest]);
  await initializeSuperadminPassword('synthetic-restore-drill-admin-password');

  const company = await Company.query().findById(
    await recordId(db, 'base.company_default', 'base.company')
  );
  assert(company, 'Default company fixture was not installed');
  const business = await Partner.query().insert({
    name: fixture.businessName,
    email: 'restore-drill-business@example.test',
    is_company: true,
    company_id: company.id,
  });
  const child = await Partner.query().insert({
    name: fixture.childName,
    parent_id: business.id,
    company_id: company.id,
  });
  const address = await PartnerAddress.query().insert({
    partner_id: business.id,
    label: fixture.addressLabel,
    address_type: 'contact',
    street: '10 Recovery Lane',
    city: 'Recovery City',
    postal_code: '00010',
    is_primary: true,
  });
  const session = await createAuthService().register({
    login: fixture.login,
    password: requiredEnvironment('RESTORE_DRILL_PASSWORD'),
    name: 'Restore Drill User',
    email: fixture.email,
  });
  assert(session.login === fixture.login, 'Synthetic fixture login did not succeed');
  assert(child.parent_id === business.id, 'Synthetic partner hierarchy did not persist');
  assert(address.partner_id === business.id, 'Synthetic partner address did not persist');

  const expected = await recordExpectations(db);
  assert(expected.ids.child === child.id, 'Synthetic child identity changed');
  assert(expected.ids.address === address.id, 'Synthetic address identity changed');
  await writeFile(expectationsPath, `${JSON.stringify(expected, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
  await chmod(expectationsPath, 0o600);
  process.stdout.write(`${JSON.stringify({ status: 'seeded', tableCounts: expected.counts })}\n`);
}

async function verify(db: Knex, expectationsPath: string): Promise<void> {
  const expected = JSON.parse(await readFile(expectationsPath, 'utf8')) as RestoreExpectations;
  const actual = await recordExpectations(db);
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    'Restored counts or record IDs differ'
  );

  const business = await Partner.query().findById(expected.ids.business).throwIfNotFound();
  assert(
    business.company_id === expected.ids.company,
    'Business company relation was not restored'
  );
  const addresses = await PartnerAddress.query().where({ partner_id: expected.ids.business });
  assert(
    addresses.some((address) => address.id === expected.ids.address && address.is_primary),
    'Business address relation was not restored'
  );
  const children = await Partner.query().where({ parent_id: expected.ids.business });
  assert(
    children.some((child) => child.id === expected.ids.child),
    'Parent/child partner relation was not restored'
  );
  assert(
    await db('company_memberships')
      .where({ user_id: expected.ids.user, company_id: expected.ids.company })
      .first(),
    'Synthetic user company membership was not restored'
  );

  const session = await createAuthService().login(
    fixture.login,
    requiredEnvironment('RESTORE_DRILL_PASSWORD')
  );
  assert(
    session.userId === expected.ids.user,
    'Synthetic account could not authenticate after restore'
  );
  process.stdout.write(
    `${JSON.stringify({
      status: 'verified',
      tableCounts: actual.counts,
      relationshipChecks: ['user-company-membership', 'partner-child', 'partner-address'],
      syntheticLogin: 'passed',
    })}\n`
  );
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode !== 'seed' && mode !== 'verify') throw new Error('Expected mode: seed or verify');
  const connectionString = requiredEnvironment('RESTORE_DRILL_DATABASE_URL');
  const expectationsPath = requiredEnvironment('RESTORE_DRILL_EXPECTATIONS_FILE');
  const schema = process.env.RESTORE_DRILL_SCHEMA;
  if (schema && !/^[A-Za-z_][A-Za-z0-9_]{0,62}$/u.test(schema)) {
    throw new Error('RESTORE_DRILL_SCHEMA must be a safe PostgreSQL schema name');
  }
  const db = knex({
    client: 'pg',
    connection: { connectionString, statement_timeout: 30_000 },
    pool: { min: 0, max: 4, acquireTimeoutMillis: 10_000 },
    ...(schema ? { searchPath: [schema] } : {}),
  });
  try {
    await db.raw('select 1');
    if (mode === 'seed') await seed(db, expectationsPath);
    else {
      bindFixtureModels(db);
      await verify(db, expectationsPath);
    }
  } finally {
    await db.destroy();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Restore fixture failed'}\n`);
  process.exitCode = 1;
});
