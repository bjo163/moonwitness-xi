import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RelationMappings } from 'objection';
import knex, { type Knex } from 'knex';
import {
  defineAddon,
  defineModel,
  Environment,
  fields,
  installAddons,
  ref,
  seed,
  type SeedRecord,
} from '@moonwitness/orm';
import {
  manifest,
  countries,
  countryDataSource,
  countryStateDataSource,
  countryStates,
  Partner,
  User,
  Company,
  Country,
  CountryState,
  Currency,
  Language,
  resolveUserPreferences,
  Tag,
  TagLink,
  Attachment,
  Activity,
  Sequence,
  AccessGroup,
  GroupMembership,
  ModelAccess,
  AuditLog,
  PartnerAddress,
  PartnerCategory,
  PartnerCategoryLink,
} from '../src/index.js';

describe('declarative addons', () => {
  let db: Knex;
  beforeEach(() => {
    db = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
      pool: {
        afterCreate(
          connection: { pragma(sql: string): unknown },
          done: (error: Error | null, connection: unknown) => void
        ) {
          connection.pragma('foreign_keys = ON');
          done(null, connection);
        },
      },
    });
  });
  afterEach(async () => {
    await db.destroy();
  });

  it('infers schema and relations and seeds exactly 2 users plus 10 partners', async () => {
    await installAddons(db, [manifest]);
    await installAddons(db, [manifest]);
    expect(manifest.menus?.map((menu) => menu.model).sort()).toEqual(
      manifest.models.map((model) => model.modelName).sort()
    );
    const seededModels = new Set(manifest.data?.map((record) => record.model.modelName));
    expect(
      manifest.models
        .filter((model) => model !== AuditLog)
        .filter((model) => !seededModels.has(model.modelName))
        .map((model) => model.modelName)
    ).toEqual([]);
    expect(seededModels.has(AuditLog.modelName)).toBe(false);
    expect(await db('users').count({ count: '*' }).first()).toMatchObject({ count: 2 });
    expect(await db('partners').count({ count: '*' }).first()).toMatchObject({ count: 10 });
    expect(await db('partner_categories').count({ count: '*' }).first()).toMatchObject({
      count: 2,
    });
    expect(await db('partner_category_links').count({ count: '*' }).first()).toMatchObject({
      count: 2,
    });
    expect(await db('partner_addresses').count({ count: '*' }).first()).toMatchObject({ count: 1 });
    expect(await db('company_memberships').count({ count: '*' }).first()).toMatchObject({
      count: 2,
    });
    expect(await db('companies').count({ count: '*' }).first()).toMatchObject({ count: 1 });
    expect(await db('countries').count({ count: '*' }).first()).toMatchObject({ count: 249 });
    expect(await db('country_states').count({ count: '*' }).first()).toMatchObject({
      count: countryStates.length,
    });
    expect(await db('banks').count({ count: '*' }).first()).toMatchObject({ count: 8 });
    expect(await db('partner_banks').count({ count: '*' }).first()).toMatchObject({ count: 2 });
    expect(await db('currencies').count({ count: '*' }).first()).toMatchObject({ count: 1 });
    expect(await db('languages').count({ count: '*' }).first()).toMatchObject({ count: 1 });
    expect(await db('tags').count({ count: '*' }).first()).toMatchObject({ count: 1 });
    expect(await db('tag_links').count({ count: '*' }).first()).toMatchObject({ count: 1 });
    expect(await db('attachments').count({ count: '*' }).first()).toMatchObject({ count: 1 });
    expect(await db('activities').count({ count: '*' }).first()).toMatchObject({ count: 1 });
    expect(await db('sequences').count({ count: '*' }).first()).toMatchObject({ count: 2 });
    expect(await db('access_groups').count({ count: '*' }).first()).toMatchObject({ count: 3 });
    expect(await db('group_memberships').count({ count: '*' }).first()).toMatchObject({ count: 1 });
    expect(await db('model_access').count({ count: '*' }).first()).toMatchObject({ count: 1 });
    expect(await db.schema.hasColumn('users', 'name')).toBe(false);
    expect(await db.schema.hasColumn('users', 'email')).toBe(false);
    expect(await db.schema.hasColumn('partners', 'company_id')).toBe(true);
    expect(await db.schema.hasColumn('partners', 'company')).toBe(false);
    const indexes = await db('sqlite_master')
      .where({ type: 'index', tbl_name: 'partners' })
      .select('sql');
    expect(indexes.some(({ sql }) => sql?.includes('company_id'))).toBe(true);
    expect(indexes.some(({ sql }) => sql?.includes('active`, `id'))).toBe(true);
    const admin = await User.query()
      .findOne({ login: 'superadmin' })
      .withGraphFetched('partner.company');
    expect(admin?.role).toBe('superadmin');
    expect(admin?.partner?.name).toBe('Super Administrator');
    expect(admin?.partner?.company_id).toBeDefined();
    expect(admin?.partner?.company?.name).toBe('MoonWitness');
    const company = await Company.query()
      .findOne({ name: 'MoonWitness' })
      .withGraphFetched('[country, currency, language]');
    expect(company?.timezone).toBe('UTC');
    expect(company?.country?.code).toBe('US');
    expect(await Country.query().findOne({ code: 'ID' })).toMatchObject({ name: 'Indonesia' });
    expect(company?.currency?.code).toBe('USD');
    expect(company?.language?.code).toBe('en-US');
    expect(admin?.active).toBe(true);
    expect((await Company.query().findOne({ name: 'MoonWitness' }))?.email).toBe(
      'company@moonwitness.local'
    );
    const tagLink = await TagLink.query()
      .findOne({ resource_model: Partner.modelName })
      .withGraphFetched('tag');
    expect(tagLink?.tag?.name).toBe('Customer');
    expect((await Partner.query().findOne({ name: 'Acme Studio' }))?.id).toBe(3);
    const acme = await Partner.query()
      .findOne({ name: 'Acme Studio' })
      .withGraphFetched('[addresses.country, category_links.category]');
    const populatedAcme = acme as
      | (InstanceType<typeof Partner> & {
          addresses: {
            label: string;
            address_type: string;
            city: string;
            country: { code: string };
          }[];
          category_links: { category: { code: string } }[];
        })
      | undefined;
    expect(populatedAcme?.addresses).toMatchObject([
      {
        label: 'Headquarters',
        address_type: 'contact',
        city: 'San Francisco',
        country: { code: 'US' },
      },
    ]);
    expect(populatedAcme?.category_links).toMatchObject([{ category: { code: 'customer' } }]);
    expect(await PartnerCategory.query().resultSize()).toBe(2);
    expect(await PartnerCategoryLink.query().resultSize()).toBe(2);
    expect(await PartnerAddress.query().resultSize()).toBe(1);
    expect(await Tag.query().findOne({ name: 'Customer' })).toBeDefined();
    expect(await Attachment.query().findOne({ name: 'acme-proposal.pdf' })).toMatchObject({
      resource_model: Partner.modelName,
      resource_id: 3,
      storage_key: 'examples/acme-proposal.pdf',
    });
    expect(
      await Activity.query().findOne({ summary: 'Example: follow up with Acme Studio' })
    ).toMatchObject({
      resource_model: Partner.modelName,
      resource_id: 3,
      assigned_to_id: admin?.id,
    });
    expect(await Sequence.query().findOne({ code: 'sales.order' })).toMatchObject({
      prefix: 'SO-',
      next_number: 1,
    });
    const userGroup = await AccessGroup.query().findOne({ code: 'user' }).throwIfNotFound();
    expect(await ModelAccess.query().findOne({ group_id: userGroup.id })).toMatchObject({
      model_name: 'base.partner',
      read: true,
      create: false,
      write: false,
      unlink: false,
    });
    expect(await GroupMembership.query().resultSize()).toBe(1);
  });

  it('validates reference-data codes, provenance, coverage, relations, and non-destructive updates', async () => {
    expect(countryDataSource.standard).toBe('ISO 3166-1 alpha-2');
    expect(countryDataSource.url).toMatch(/^https:\/\//);
    expect(countryDataSource.verifiedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(countries).toHaveLength(249);
    expect(new Set(countries.map((country) => country.code)).size).toBe(countries.length);
    expect(countries.every((country) => /^[A-Z]{2}$/.test(country.code))).toBe(true);
    expect(countryStateDataSource.coverage).toContain('not complete worldwide');
    expect(new Set(countryStates.map((state) => state.code)).size).toBe(countryStates.length);
    expect(countryStates.every((state) => /^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(state.code))).toBe(true);
    expect(
      countryStates.every((state) =>
        countries.some((country) => country.code === state.countryCode)
      )
    ).toBe(true);

    await installAddons(db, [manifest]);
    const indonesia = await Country.query().findOne({ code: 'ID' }).throwIfNotFound();
    const indonesianCountryState = await CountryState.query()
      .findOne({ code: 'ID-JK' })
      .throwIfNotFound();
    await Country.query().findById(indonesia.id).patch({ name: 'User-customized Indonesia' });
    await CountryState.query()
      .findById(indonesianCountryState.id)
      .patch({ name: 'User-customized Jakarta' });
    await installAddons(db, [manifest]);
    await expect(Country.query().findById(indonesia.id)).resolves.toMatchObject({
      name: 'User-customized Indonesia',
    });
    await expect(CountryState.query().findById(indonesianCountryState.id)).resolves.toMatchObject({
      name: 'User-customized Jakarta',
    });
    expect(await db('countries').count({ count: '*' }).first()).toMatchObject({ count: 249 });
    expect(await db('country_states').count({ count: '*' }).first()).toMatchObject({
      count: countryStates.length,
    });
  });

  it('keeps addon metadata internally consistent across models, relations, views, menus, and seeds', async () => {
    const modelNames = new Set(manifest.models.map((model) => model.modelName));
    const viewsByModel = new Map((manifest.views ?? []).map((view) => [view.model, view]));
    const menusByModel = new Map((manifest.menus ?? []).map((menu) => [menu.model, menu]));
    const seededModels = new Set((manifest.data ?? []).map((record) => record.model.modelName));

    expect(modelNames.size).toBe(manifest.models.length);
    expect(viewsByModel.size).toBe(manifest.views?.length);
    expect(menusByModel.size).toBe(manifest.menus?.length);
    expect([...menusByModel.keys()].sort()).toEqual([...modelNames].sort());
    const modelsWithoutSeeds = [...modelNames].filter((name) => !seededModels.has(name));
    expect(modelsWithoutSeeds).toEqual([AuditLog.modelName]);

    for (const model of manifest.models) {
      const view = viewsByModel.get(model.modelName);
      if (model !== AuditLog) {
        expect(view, `${model.modelName} should declare a view`).toBeDefined();
      }
      expect(seededModels.has(model.modelName) || model === AuditLog).toBe(true);

      for (const [name, field] of Object.entries(model.fields)) {
        if (field.kind === 'belongsTo' || field.kind === 'hasMany') {
          const target =
            typeof field.target === 'function' && !('tableName' in field.target)
              ? field.target()
              : field.target;
          expect(target, `${model.modelName}.${name} target`).toBeDefined();
          if (target) {
            expect(modelNames.has(target.modelName), `${model.modelName}.${name} target`).toBe(
              true
            );
          }
          const relationMappings = model.relationMappings as RelationMappings;
          expect(relationMappings[name], `${model.modelName}.${name} mapping`).toBeDefined();
        }
      }

      const usedColumns = [
        ...(view?.spec.list?.columns ?? []),
        ...(view?.spec.search?.fields ?? []),
        ...(view?.spec.form?.sections?.flatMap((section) => section.fields) ?? []),
      ];
      const columns = new Set([
        ...Object.entries(model.fields).map(([name, field]) =>
          field.kind === 'belongsTo' ? `${name}_id` : name
        ),
        'id',
        'active',
        'create_date',
        'write_date',
      ]);
      for (const column of usedColumns) {
        expect(columns.has(column), `${model.modelName} view column ${column}`).toBe(true);
      }
    }

    const seedIds = (manifest.data ?? []).map((record) => record.id);
    expect(new Set(seedIds).size).toBe(seedIds.length);
    for (const record of manifest.data ?? []) {
      for (const [name, value] of Object.entries(record.values)) {
        const field = record.model.fields[name];
        expect(field, `${record.id}.${name} field`).toBeDefined();
        if (typeof value === 'object' && value !== null) {
          expect(field?.kind, `${record.id}.${name} reference field`).toBe('belongsTo');
          expect(seedIds, `${record.id}.${name} reference`).toContain(value.$ref);
        }
      }
    }
  });

  it('keeps seed identities and edits after email and login change', async () => {
    await installAddons(db, [manifest]);
    const admin = await User.query().findOne({ login: 'superadmin' }).throwIfNotFound();
    await User.query().findById(admin.id).patch({ login: 'owner' });
    await Partner.query().findById(admin.partner_id).patch({ email: 'owner@example.test' });
    await installAddons(db, [manifest]);
    expect(await db('users').count({ count: '*' }).first()).toMatchObject({ count: 2 });
    expect(await db('partners').count({ count: '*' }).first()).toMatchObject({ count: 10 });
    expect((await User.query().findById(admin.id))?.login).toBe('owner');
    expect((await Partner.query().findById(admin.partner_id))?.email).toBe('owner@example.test');
  });

  it('generates input validation, defaults, uniqueness and foreign keys', async () => {
    await installAddons(db, [manifest]);
    await expect(
      // @ts-expect-error deliberate invalid runtime input must also be rejected by validation
      User.query().insert({ login: 'bad', partner_id: 1, role: 'root' })
    ).rejects.toThrow();
    await expect(Partner.query().insert({ name: '' })).rejects.toThrow();
    await expect(Country.query().insert({ code: 'usa', name: 'Invalid Code' })).rejects.toThrow();
    await expect(
      Currency.query().insert({ code: 'usdollar', name: 'Invalid Code' })
    ).rejects.toThrow();
    await expect(
      Language.query().insert({ code: 'en_US', name: 'Invalid Code' })
    ).rejects.toThrow();
    await expect(User.query().insert({ login: 'orphan', partner_id: 9999 })).rejects.toThrow();
    const partner = await Partner.query().insertAndFetch({ name: 'New Person' });
    const user = await User.query().insertAndFetch({ login: 'new', partner_id: partner.id });
    expect(user.role).toBe('user');
    const invalidTimezonePartner = await Partner.query().insertAndFetch({
      name: 'Invalid Timezone',
    });
    await expect(
      User.query().insert({
        login: 'bad-timezone',
        partner_id: invalidTimezonePartner.id,
        timezone: 'Mars Olympus',
      })
    ).rejects.toThrow();
    await expect(User.query().insert({ login: 'new', partner_id: 3 })).rejects.toThrow();
  });

  it('adds optional columns without dropping existing records', async () => {
    await installAddons(db, [manifest]);
    const ExtendedPartner = defineModel('base.partner', {
      table: 'partners',
      fields: { ...Partner.fields, test_field: fields.string() },
    });
    await installAddons(db, [
      defineAddon({
        name: 'base',
        version: '1.1.0',
        models: [Country, CountryState, Currency, Language, Company, ExtendedPartner],
      }),
    ]);
    expect(await db.schema.hasColumn('partners', 'test_field')).toBe(true);
    expect(await db('partners').count({ count: '*' }).first()).toMatchObject({ count: 10 });
    const UnsafePartner = defineModel('base.partner', {
      table: 'partners',
      fields: { ...Partner.fields, secret: fields.string({ required: true }) },
    });
    await expect(
      installAddons(db, [
        defineAddon({
          name: 'base',
          version: '2.0.0',
          models: [Country, CountryState, Currency, Language, Company, UnsafePartner],
        }),
      ])
    ).rejects.toThrow('Cannot safely add');
    expect(await db.schema.hasColumn('partners', 'secret')).toBe(false);
  });

  it('adds the default company and optional partner relation to existing data', async () => {
    const { company: _company, state: _state, parent: _parent, ...legacyFields } = Partner.fields;
    const LegacyPartner = defineModel('base.partner', { table: 'partners', fields: legacyFields });
    const legacyModels = new Set([
      Country.modelName,
      Currency.modelName,
      Language.modelName,
      Company.modelName,
      LegacyPartner.modelName,
      User.modelName,
    ]);
    const legacyData = (manifest.data ?? []).flatMap((record) => {
      if (!legacyModels.has(record.model.modelName)) return [];
      if (record.model === Company) return [];
      const model = record.model === Partner ? LegacyPartner : record.model;
      if (model !== LegacyPartner) return [{ ...record, model }];
      const { company: _company, state: _state, parent: _parent, ...values } = record.values;
      return [{ ...record, model, values }];
    });
    await installAddons(db, [
      defineAddon({
        ...manifest,
        models: [Country, Currency, Language, Company, LegacyPartner, User],
        menus: manifest.menus?.filter((menu) => legacyModels.has(menu.model)),
        views: manifest.views?.filter((view) =>
          [Country, Currency, Language, Company, Partner, User].some(
            (model) => model.modelName === view.model
          )
        ),
        data: legacyData,
      }),
    ]);
    const countBefore = await db('partners').count({ count: '*' }).first();
    await installAddons(db, [manifest]);
    expect(await db('companies').count({ count: '*' }).first()).toMatchObject({ count: 1 });
    expect(await db('partners').count({ count: '*' }).first()).toEqual(countBefore);
    const profile = await Partner.query()
      .findOne({ email: 'superadmin@moonwitness.local' })
      .withGraphFetched('company');
    expect(profile?.company?.name).toBe('MoonWitness');
  });

  it('upgrades a populated legacy schema without losing records or seed links', async () => {
    const {
      street: _companyStreet,
      city: _companyCity,
      postal_code: _companyPostalCode,
      country: _companyCountry,
      currency: _companyCurrency,
      language: _companyLanguage,
      timezone: _companyTimezone,
      ...legacyCompanyFields
    } = Company.fields;
    const {
      street: _partnerStreet,
      city: _partnerCity,
      postal_code: _partnerPostalCode,
      country: _partnerCountry,
      company: _partnerCompany,
      state: _partnerState,
      parent: _partnerParent,
      ...legacyPartnerFields
    } = Partner.fields;
    const { language: _userLanguage, timezone: _userTimezone, ...legacyUserFields } = User.fields;
    const LegacyCompany = defineModel('base.company', {
      table: 'companies',
      fields: legacyCompanyFields,
    });
    const LegacyPartner = defineModel('base.partner', {
      table: 'partners',
      fields: legacyPartnerFields,
    });
    const LegacyUser = defineModel('base.user', { table: 'users', fields: legacyUserFields });
    const legacyModels = new Map<string, SeedRecord['model']>([
      [Company.modelName, LegacyCompany],
      [Partner.modelName, LegacyPartner],
      [User.modelName, LegacyUser],
    ]);
    const legacyModelNames = new Set([
      Country.modelName,
      Currency.modelName,
      Language.modelName,
      LegacyCompany.modelName,
      LegacyPartner.modelName,
      LegacyUser.modelName,
    ]);
    const legacyData: SeedRecord[] = (manifest.data ?? [])
      .filter((record) => legacyModelNames.has(record.model.modelName))
      .map((record) => {
        const model = legacyModels.get(record.model.modelName);
        if (!model) return record;
        const values = Object.fromEntries(
          Object.entries(record.values).filter(([field]) => field in model.fields)
        );
        return { ...record, model, values } as SeedRecord;
      });

    await installAddons(db, [
      defineAddon({
        name: 'base',
        version: '0.9.0',
        models: [Country, Currency, Language, LegacyCompany, LegacyPartner, LegacyUser],
        data: legacyData,
      }),
    ]);
    const before = {
      companies: await db('companies').count({ count: '*' }).first(),
      partners: await db('partners').count({ count: '*' }).first(),
      users: await db('users').count({ count: '*' }).first(),
    };

    await installAddons(db, [manifest]);

    expect(await db('companies').count({ count: '*' }).first()).toEqual(before.companies);
    expect(await db('partners').count({ count: '*' }).first()).toEqual(before.partners);
    expect(await db('users').count({ count: '*' }).first()).toEqual(before.users);
    expect(await db.schema.hasColumn('partners', 'street')).toBe(true);
    expect(await db.schema.hasColumn('users', 'language_id')).toBe(true);
    expect(await db.schema.hasColumn('companies', 'timezone')).toBe(true);
    const company = await Company.query()
      .findOne({ name: 'MoonWitness' })
      .withGraphFetched('[country, currency, language]');
    expect(company).toMatchObject({
      timezone: 'UTC',
      country: { code: 'US' },
      currency: { code: 'USD' },
      language: { code: 'en-US' },
    });
    const admin = await User.query()
      .findOne({ login: 'superadmin' })
      .withGraphFetched('partner.company');
    expect(admin?.partner?.company?.name).toBe('MoonWitness');
  });

  it('orders dependencies and seed references independently of declaration order', async () => {
    await installAddons(db, [
      defineAddon({
        ...manifest,
        models: [User, Partner, Company, CountryState, Country, Currency, Language],
        menus: manifest.menus?.filter((menu) =>
          [User, Partner, Company, CountryState, Country, Currency, Language].some(
            (model) => model.modelName === menu.model
          )
        ),
        views: manifest.views?.filter((view) =>
          [User, Partner, Company, CountryState, Country, Currency, Language].some(
            (model) => model.modelName === view.model
          )
        ),
        data: (manifest.data ?? [])
          .filter((record) =>
            [User, Partner, Company, CountryState, Country, Currency, Language].some(
              (model) => model.modelName === record.model.modelName
            )
          )
          .reverse(),
      }),
    ]);
    expect(await User.query().resultSize()).toBe(2);
    await expect(
      installAddons(db, [
        defineAddon({ name: 'missing', version: '1.0.0', depends: ['unknown'], models: [] }),
      ])
    ).rejects.toThrow('Missing dependency');
  });

  it('rejects duplicate country, currency and language codes', async () => {
    await installAddons(db, [manifest]);
    await expect(Country.query().insert({ code: 'US', name: 'Another Country' })).rejects.toThrow();
    await expect(
      Currency.query().insert({ code: 'USD', name: 'Another Currency' })
    ).rejects.toThrow();
    await expect(
      Language.query().insert({ code: 'en-US', name: 'Another Language' })
    ).rejects.toThrow();
  });

  it('resolves user locale overrides through company defaults', async () => {
    await installAddons(db, [manifest]);
    const admin = await User.query().findOne({ login: 'superadmin' }).throwIfNotFound();
    expect(await resolveUserPreferences(admin.id)).toEqual({ language: 'en-US', timezone: 'UTC' });

    const indonesian = await Language.query().insertAndFetch({
      code: 'id-ID',
      name: 'Bahasa Indonesia',
    });
    await User.query()
      .findById(admin.id)
      .patch({ language_id: indonesian.id, timezone: 'Asia/Jakarta' });
    expect(await resolveUserPreferences(admin.id)).toEqual({
      language: 'id-ID',
      timezone: 'Asia/Jakarta',
    });

    await User.query().findById(admin.id).patch({ language_id: null, timezone: null });
    expect(await resolveUserPreferences(admin.id)).toEqual({ language: 'en-US', timezone: 'UTC' });
  });

  it('records audit dates and actor IDs on inserts and updates', async () => {
    await installAddons(db, [manifest]);
    const actor = new Environment({ userId: 42 }).get<typeof Partner>(Partner.modelName);
    const partner = await actor.query().insertAndFetch({ name: 'Audited Partner' });
    expect(Date.parse(partner.create_date ?? '')).not.toBeNaN();
    expect(Date.parse(partner.write_date ?? '')).not.toBeNaN();
    expect(partner.create_uid).toBe(42);
    expect(partner.write_uid).toBe(42);

    await new Promise((resolve) => setTimeout(resolve, 5));
    await actor.query().findById(partner.id).patch({ city: 'Jakarta' });
    const updated = await actor.query().findById(partner.id).throwIfNotFound();
    expect(Date.parse(updated.write_date ?? '')).not.toBeNaN();
    expect(updated.write_date).not.toBe(partner.write_date);
    expect(updated.write_uid).toBe(42);
  });

  it('rolls back schema and data if an external reference is missing', async () => {
    const broken = defineAddon({
      ...manifest,
      data: [seed(User, 'broken.user', { login: 'broken', partner: ref('missing.profile') })],
    });
    await expect(installAddons(db, [broken])).rejects.toThrow('Unknown data reference');
    expect(await db.schema.hasTable('users')).toBe(false);
    expect(await db.schema.hasTable('partners')).toBe(false);
  });

  it('tracks addon versions and runs only explicit transactional upgrade hooks', async () => {
    const first = defineAddon({ name: 'upgrade.sample', version: '1.0.0', models: [] });
    const second = defineAddon({
      name: 'upgrade.sample',
      version: '1.1.0',
      models: [],
      upgrade: {
        '1.0.0': async (trx) => {
          await trx.schema.createTable('upgrade_marker', (table) => table.string('value'));
          await trx('upgrade_marker').insert({ value: 'upgraded' });
        },
      },
    });
    await installAddons(db, [first]);
    await installAddons(db, [second]);
    expect(await db('upgrade_marker').first('value')).toEqual({ value: 'upgraded' });
    expect(
      await db('_orm_addons').where({ name: 'upgrade.sample' }).first('version')
    ).toMatchObject({
      version: '1.1.0',
    });
    await expect(installAddons(db, [first])).rejects.toThrow(/downgrade rejected/i);
  });
});
