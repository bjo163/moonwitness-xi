import { defineAddon, ref, seed } from '@moonwitness/orm';
import { ModelAccess } from '@moonwitness/orm-base';
import {
  OrganizationDepartment,
  OrganizationMembership,
  OrganizationPosition,
  OrganizationTeam,
} from './models.js';
import { views } from './views.js';

export const manifest = defineAddon({
  name: 'organization',
  version: '1.0.0',
  depends: ['base'],
  models: [OrganizationDepartment, OrganizationTeam, OrganizationPosition, OrganizationMembership],
  data: [
    seed(OrganizationDepartment, 'organization.department_operations', {
      company: ref('base.company_default'),
      code: 'operations',
      name: 'Operations',
      description: 'Company operations and administration example.',
    }),
    seed(OrganizationDepartment, 'organization.department_product', {
      company: ref('base.company_default'),
      code: 'product',
      name: 'Product',
      description: 'Product engineering example.',
    }),
    seed(OrganizationTeam, 'organization.team_api', {
      company: ref('base.company_default'),
      department: ref('organization.department_product'),
      code: 'api',
      name: 'API',
      description: 'API platform team example.',
    }),
    seed(OrganizationTeam, 'organization.team_board', {
      company: ref('base.company_default'),
      department: ref('organization.department_product'),
      code: 'board',
      name: 'Board',
      description: 'Board application team example.',
    }),
    seed(OrganizationPosition, 'organization.position_engineer', {
      company: ref('base.company_default'),
      department: ref('organization.department_product'),
      code: 'engineer',
      name: 'Software Engineer',
    }),
    seed(OrganizationPosition, 'organization.position_lead', {
      company: ref('base.company_default'),
      department: ref('organization.department_product'),
      code: 'team_lead',
      name: 'Team Lead',
    }),
    seed(OrganizationMembership, 'organization.member_system', {
      company: ref('base.company_default'),
      user: ref('base.user_system'),
      department: ref('organization.department_operations'),
      position: ref('organization.position_lead'),
      start_date: '2026-01-01',
    }),
    seed(OrganizationMembership, 'organization.member_superadmin', {
      company: ref('base.company_default'),
      user: ref('base.user_superadmin'),
      department: ref('organization.department_product'),
      team: ref('organization.team_api'),
      position: ref('organization.position_engineer'),
      manager: ref('organization.member_system'),
      start_date: '2026-01-01',
    }),
    seed(ModelAccess, 'organization.access_user_departments_read', {
      group: ref('base.group_user'),
      model_name: OrganizationDepartment.modelName,
      read: true,
      create: false,
      write: false,
      unlink: false,
    }),
    seed(ModelAccess, 'organization.access_user_teams_read', {
      group: ref('base.group_user'),
      model_name: OrganizationTeam.modelName,
      read: true,
      create: false,
      write: false,
      unlink: false,
    }),
    seed(ModelAccess, 'organization.access_user_positions_read', {
      group: ref('base.group_user'),
      model_name: OrganizationPosition.modelName,
      read: true,
      create: false,
      write: false,
      unlink: false,
    }),
    seed(ModelAccess, 'organization.access_user_memberships_read', {
      group: ref('base.group_user'),
      model_name: OrganizationMembership.modelName,
      read: true,
      create: false,
      write: false,
      unlink: false,
    }),
  ],
  views,
  menus: [
    {
      model: OrganizationDepartment.modelName,
      label: 'Departments',
      group: 'Organization',
      sequence: 35,
    },
    { model: OrganizationTeam.modelName, label: 'Teams', group: 'Organization', sequence: 36 },
    {
      model: OrganizationPosition.modelName,
      label: 'Positions',
      group: 'Organization',
      sequence: 37,
    },
    {
      model: OrganizationMembership.modelName,
      label: 'Organization Members',
      group: 'Organization',
      sequence: 38,
    },
  ],
});
