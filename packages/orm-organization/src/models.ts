import { defineModel, fields, type BaseModel } from '@moonwitness/orm';
import { Company, User } from '@moonwitness/orm-base';

function departmentModel(): typeof BaseModel {
  return OrganizationDepartment;
}

function teamModel(): typeof BaseModel {
  return OrganizationTeam;
}

function membershipModel(): typeof BaseModel {
  return OrganizationMembership;
}

export const OrganizationDepartment = defineModel('organization.department', {
  table: 'organization_departments',
  order: 'company_id asc, name asc',
  unique: [['company', 'code']],
  fields: {
    company: fields.belongsTo(Company, { required: true }),
    parent: fields.belongsTo(departmentModel),
    code: fields.string({ required: true, pattern: '^[a-z][a-z0-9_-]{1,63}$' }),
    name: fields.string({ required: true }),
    description: fields.text(),
  },
});

export const OrganizationTeam = defineModel('organization.team', {
  table: 'organization_teams',
  order: 'company_id asc, name asc',
  unique: [['company', 'code']],
  fields: {
    company: fields.belongsTo(Company, { required: true }),
    department: fields.belongsTo(OrganizationDepartment, { required: true }),
    parent: fields.belongsTo(teamModel),
    code: fields.string({ required: true, pattern: '^[a-z][a-z0-9_-]{1,63}$' }),
    name: fields.string({ required: true }),
    description: fields.text(),
  },
});

export const OrganizationPosition = defineModel('organization.position', {
  table: 'organization_positions',
  order: 'company_id asc, name asc',
  unique: [['company', 'code']],
  fields: {
    company: fields.belongsTo(Company, { required: true }),
    department: fields.belongsTo(OrganizationDepartment),
    code: fields.string({ required: true, pattern: '^[a-z][a-z0-9_-]{1,63}$' }),
    name: fields.string({ required: true }),
    description: fields.text(),
  },
});

export const OrganizationMembership = defineModel('organization.membership', {
  table: 'organization_memberships',
  order: 'company_id asc, user_id asc',
  unique: [['company', 'user']],
  fields: {
    company: fields.belongsTo(Company, { required: true }),
    user: fields.belongsTo(User, { required: true }),
    department: fields.belongsTo(OrganizationDepartment, { required: true }),
    team: fields.belongsTo(OrganizationTeam),
    position: fields.belongsTo(OrganizationPosition),
    manager: fields.belongsTo(membershipModel),
    start_date: fields.string({ required: true, pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
    end_date: fields.string({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
  },
});

OrganizationDepartment.relationMappings = {
  ...OrganizationDepartment.relationMappings,
  children: {
    relation: OrganizationDepartment.HasManyRelation,
    modelClass: OrganizationDepartment,
    join: { from: 'organization_departments.id', to: 'organization_departments.parent_id' },
  },
  teams: {
    relation: OrganizationDepartment.HasManyRelation,
    modelClass: OrganizationTeam,
    join: { from: 'organization_departments.id', to: 'organization_teams.department_id' },
  },
};

OrganizationTeam.relationMappings = {
  ...OrganizationTeam.relationMappings,
  members: {
    relation: OrganizationTeam.HasManyRelation,
    modelClass: OrganizationMembership,
    join: { from: 'organization_teams.id', to: 'organization_memberships.team_id' },
  },
};

OrganizationMembership.relationMappings = {
  ...OrganizationMembership.relationMappings,
  direct_reports: {
    relation: OrganizationMembership.HasManyRelation,
    modelClass: OrganizationMembership,
    join: { from: 'organization_memberships.id', to: 'organization_memberships.manager_id' },
  },
};
