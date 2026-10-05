import { defineView } from '@moonwitness/orm';
import { WorkflowApproval, WorkflowDefinition, WorkflowEvent, WorkflowInstance } from './models.js';

export const views = [
  defineView(WorkflowDefinition, {
    title: 'Workflow Definitions',
    list: { columns: ['code', 'version', 'name', 'enabled'], order: 'code asc, version desc' },
    form: {
      sections: [{ title: 'Definition', fields: ['code', 'version', 'name', 'config', 'enabled'] }],
    },
    search: { fields: ['code', 'name'] },
  }),
  defineView(WorkflowInstance, {
    title: 'Workflows',
    list: {
      columns: [
        'definition',
        'company',
        'resource_model',
        'resource_id',
        'current_state',
        'status',
        'due_at',
      ],
      order: 'create_date desc',
    },
    form: {
      sections: [
        {
          title: 'Instance',
          fields: [
            'definition',
            'company',
            'resource_model',
            'resource_id',
            'started_by',
            'current_state',
            'status',
            'due_at',
          ],
        },
      ],
    },
    search: { fields: ['resource_model', 'current_state'] },
  }),
  defineView(WorkflowEvent, {
    title: 'Workflow History',
    list: {
      columns: [
        'instance',
        'sequence',
        'actor',
        'action',
        'from_state',
        'to_state',
        'comment',
        'created_at',
      ],
      order: 'sequence asc',
    },
    search: { fields: ['action', 'from_state', 'to_state'] },
  }),
  defineView(WorkflowApproval, {
    title: 'Workflow Approvals',
    list: {
      columns: ['instance', 'action', 'actor', 'decision', 'comment', 'decided_at'],
      order: 'decided_at asc',
    },
    search: { fields: ['action', 'decision'] },
  }),
];
