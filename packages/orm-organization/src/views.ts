import { defineView } from '@moonwitness/orm';
import {
  OrganizationDepartment,
  OrganizationMembership,
  OrganizationPosition,
  OrganizationTeam,
} from './models.js';

export const views = [
  defineView(OrganizationDepartment, {
    title: 'Departments',
    list: { columns: ['name', 'code', 'parent', 'company'], order: 'name asc' },
    form: {
      sections: [
        { title: 'Department', fields: ['name', 'code', 'parent', 'company', 'description'] },
      ],
    },
    search: { fields: ['name', 'code', 'description'] },
  }),
  defineView(OrganizationTeam, {
    title: 'Teams',
    list: { columns: ['name', 'code', 'department', 'parent', 'company'], order: 'name asc' },
    form: {
      sections: [
        {
          title: 'Team',
          fields: ['name', 'code', 'department', 'parent', 'company', 'description'],
        },
      ],
    },
    search: { fields: ['name', 'code', 'description'] },
  }),
  defineView(OrganizationPosition, {
    title: 'Positions',
    list: { columns: ['name', 'code', 'department', 'company'], order: 'name asc' },
    form: {
      sections: [
        { title: 'Position', fields: ['name', 'code', 'department', 'company', 'description'] },
      ],
    },
    search: { fields: ['name', 'code', 'description'] },
  }),
  defineView(OrganizationMembership, {
    title: 'Organization Members',
    list: {
      columns: [
        'user',
        'department',
        'team',
        'position',
        'manager',
        'start_date',
        'end_date',
        'company',
      ],
      order: 'user_id asc',
    },
    form: {
      sections: [
        {
          title: 'Assignment',
          fields: ['user', 'company', 'department', 'team', 'position', 'manager'],
        },
        { title: 'Membership Dates', fields: ['start_date', 'end_date'] },
      ],
    },
    search: {},
  }),
];
