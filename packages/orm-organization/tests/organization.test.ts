import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import knex, { type Knex } from 'knex';
import { installAddons } from '@moonwitness/orm';
import { manifest as baseManifest, Company, CompanyMembership, User } from '@moonwitness/orm-base';
import {
  manifest,
  OrganizationDepartment,
  OrganizationMembership,
  OrganizationPosition,
  OrganizationTeam,
  isValidOrganizationMutation,
} from '../src/index.js';

describe('organization addon', () => {
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

  afterEach(async () => db.destroy());

  it('installs company-scoped organization records and seeds examples without creating users', async () => {
    await installAddons(db, [manifest, baseManifest]);
    expect(await db('users').count({ count: '*' }).first()).toMatchObject({ count: 2 });
    expect(await db('organization_departments').count({ count: '*' }).first()).toMatchObject({
      count: 2,
    });
    expect(await db('organization_teams').count({ count: '*' }).first()).toMatchObject({
      count: 2,
    });
    expect(await db('organization_positions').count({ count: '*' }).first()).toMatchObject({
      count: 2,
    });
    expect(await db('organization_memberships').count({ count: '*' }).first()).toMatchObject({
      count: 2,
    });
    expect(manifest.depends).toContain('base');
    expect(manifest.menus?.map(({ model }) => model)).toEqual(
      manifest.models.map(({ modelName }) => modelName)
    );
    expect(await OrganizationMembership.query().findOne({ user_id: 2 })).toMatchObject({
      company_id: 1,
      start_date: '2026-01-01',
    });

    await db('organization_memberships').whereNotNull('manager_id').delete();
    await db('organization_memberships').delete();
    await db('organization_teams').delete();
    await db('organization_positions').delete();
    await db('organization_departments').delete();
    expect(await db('users').count({ count: '*' }).first()).toMatchObject({ count: 2 });
  });

  it('rejects cross-company references and permits only matching org structure', async () => {
    await installAddons(db, [baseManifest, manifest]);
    const secondCompany = await Company.query().insertAndFetch({ name: 'Second Company' });
    const system = await User.query().findOne({ login: 'system' }).throwIfNotFound();
    await CompanyMembership.query().insert({ user_id: system.id, company_id: secondCompany.id });
    const secondDepartment = await OrganizationDepartment.query().insertAndFetch({
      company_id: secondCompany.id,
      code: 'finance',
      name: 'Finance',
    });
    const originalTeam = await OrganizationTeam.query().findOne({ code: 'api' });
    const originalPosition = await OrganizationPosition.query().findOne({ code: 'engineer' });

    expect(
      await isValidOrganizationMutation(OrganizationMembership.modelName, {
        company_id: secondCompany.id,
        user_id: system.id,
        department_id: secondDepartment.id,
        team_id: originalTeam.id,
        position_id: originalPosition.id,
        start_date: '2026-01-01',
      })
    ).toBe(false);
    expect(
      await isValidOrganizationMutation(OrganizationMembership.modelName, {
        company_id: secondCompany.id,
        user_id: system.id,
        department_id: secondDepartment.id,
        start_date: '2026-01-01',
      })
    ).toBe(true);
  });

  it('rejects department/team parent cycles and reporting cycles', async () => {
    await installAddons(db, [baseManifest, manifest]);
    const department = await OrganizationDepartment.query()
      .findOne({ code: 'product' })
      .throwIfNotFound();
    const team = await OrganizationTeam.query().findOne({ code: 'api' }).throwIfNotFound();
    const systemUser = await User.query().findOne({ login: 'system' }).throwIfNotFound();
    const superadminUser = await User.query().findOne({ login: 'superadmin' }).throwIfNotFound();
    const systemMembership = await OrganizationMembership.query()
      .findOne({ user_id: systemUser.id })
      .throwIfNotFound();
    const superadminMembership = await OrganizationMembership.query()
      .findOne({ user_id: superadminUser.id })
      .throwIfNotFound();

    expect(
      await isValidOrganizationMutation(
        OrganizationDepartment.modelName,
        { company_id: department.company_id, parent_id: department.id },
        { id: department.id, company_id: department.company_id }
      )
    ).toBe(false);
    expect(
      await isValidOrganizationMutation(
        OrganizationTeam.modelName,
        { company_id: team.company_id, department_id: team.department_id, parent_id: team.id },
        { id: team.id, company_id: team.company_id, department_id: team.department_id }
      )
    ).toBe(false);
    expect(
      await isValidOrganizationMutation(
        OrganizationMembership.modelName,
        { company_id: systemMembership.company_id, manager_id: superadminMembership.id },
        systemMembership.toJSON()
      )
    ).toBe(false);
  });

  it('rejects invalid membership dates and same-company hierarchy mismatch', async () => {
    await installAddons(db, [baseManifest, manifest]);
    const superadminUser = await User.query().findOne({ login: 'superadmin' }).throwIfNotFound();
    const membership = await OrganizationMembership.query()
      .findOne({ user_id: superadminUser.id })
      .throwIfNotFound();
    const otherDepartment = await OrganizationDepartment.query()
      .findOne({ code: 'operations' })
      .throwIfNotFound();
    const team = await OrganizationTeam.query().findOne({ code: 'api' }).throwIfNotFound();

    expect(
      await isValidOrganizationMutation(
        OrganizationMembership.modelName,
        { end_date: '2025-12-31' },
        membership.toJSON()
      )
    ).toBe(false);
    expect(
      await isValidOrganizationMutation(
        OrganizationMembership.modelName,
        { department_id: otherDepartment.id, team_id: team.id },
        membership.toJSON()
      )
    ).toBe(false);
    expect(
      await isValidOrganizationMutation(
        OrganizationMembership.modelName,
        { start_date: '2026-02-30' },
        membership.toJSON()
      )
    ).toBe(false);
  });

  it('prevents moving referenced departments, teams, or positions across their hierarchy', async () => {
    await installAddons(db, [baseManifest, manifest]);
    const department = await OrganizationDepartment.query()
      .findOne({ code: 'product' })
      .throwIfNotFound();
    const team = await OrganizationTeam.query().findOne({ code: 'api' }).throwIfNotFound();
    const position = await OrganizationPosition.query()
      .findOne({ code: 'engineer' })
      .throwIfNotFound();
    const secondCompany = await Company.query().insertAndFetch({ name: 'Second Company' });
    const secondDepartment = await OrganizationDepartment.query().insertAndFetch({
      company_id: secondCompany.id,
      code: 'finance',
      name: 'Finance',
    });

    expect(
      await isValidOrganizationMutation(
        OrganizationDepartment.modelName,
        { company_id: secondCompany.id },
        department.toJSON()
      )
    ).toBe(false);
    expect(
      await isValidOrganizationMutation(
        OrganizationTeam.modelName,
        { company_id: secondCompany.id, department_id: secondDepartment.id },
        team.toJSON()
      )
    ).toBe(false);
    expect(
      await isValidOrganizationMutation(
        OrganizationPosition.modelName,
        { company_id: secondCompany.id, department_id: secondDepartment.id },
        position.toJSON()
      )
    ).toBe(false);
  });
});
