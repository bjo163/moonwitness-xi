import { defineAddon, ref, seed } from '@moonwitness/orm';
import { ModelAccess } from '@moonwitness/orm-base';
import { Cron } from '@moonwitness/jobs';
import { WorkflowApproval, WorkflowDefinition, WorkflowEvent, WorkflowInstance } from './models.js';
import { views } from './views.js';

const requestApprovalExample = {
  startState: 'draft',
  startRoles: ['user', 'superadmin', 'system'],
  timeoutMinutes: 10080,
  resourceModels: ['base.partner'],
  transitions: [
    {
      action: 'submit',
      from: 'draft',
      to: 'submitted',
      roles: ['user', 'superadmin', 'system'],
    },
    {
      action: 'approve',
      from: 'submitted',
      to: 'approved',
      roles: ['user', 'superadmin', 'system'],
      requiredApprovals: 1,
      requireDifferentActor: true,
    },
    {
      action: 'reject',
      from: 'submitted',
      to: 'rejected',
      roles: ['user', 'superadmin', 'system'],
    },
  ],
};

export const manifest = defineAddon({
  name: 'workflow',
  version: '1.0.0',
  depends: ['base', 'jobs', 'notification'],
  models: [WorkflowDefinition, WorkflowInstance, WorkflowEvent, WorkflowApproval],
  data: [
    seed(WorkflowDefinition, 'workflow.definition_sample_request_v1', {
      code: 'sample.request_approval',
      version: 1,
      name: 'Sample request approval',
      config: JSON.stringify(requestApprovalExample),
    }),
    ...([WorkflowInstance, WorkflowEvent, WorkflowApproval] as const).map((model) =>
      seed(ModelAccess, `workflow.access_user_${model.modelName.replaceAll('.', '_')}_read`, {
        group: ref('base.group_user'),
        model_name: model.modelName,
        read: true,
        create: false,
        write: false,
        unlink: false,
      })
    ),
    seed(ModelAccess, 'workflow.access_user_definition_read', {
      group: ref('base.group_user'),
      model_name: WorkflowDefinition.modelName,
      read: true,
      create: false,
      write: false,
      unlink: false,
    }),
    seed(Cron, 'workflow.cron_expire_due', {
      code: 'workflow.expire_due',
      name: 'Expire overdue workflow instances',
      handler: 'workflow.expire_due',
      payload: '{}',
      cron_expression: '* * * * *',
      timezone: 'UTC',
      enabled: true,
      next_run_at: '2026-01-01T00:00:00.000Z',
      misfire_policy: 'coalesce',
      concurrency_policy: 'forbid',
      max_catch_up: 1,
    }),
  ],
  views,
  menus: [
    { model: WorkflowInstance.modelName, label: 'Workflows', group: 'Workspace', sequence: 18 },
    { model: WorkflowEvent.modelName, label: 'Workflow History', group: 'Workspace', sequence: 19 },
    {
      model: WorkflowApproval.modelName,
      label: 'Workflow Approvals',
      group: 'Workspace',
      sequence: 20,
    },
    {
      model: WorkflowDefinition.modelName,
      label: 'Workflow Definitions',
      group: 'Technical',
      sequence: 480,
      developmentOnly: true,
    },
  ],
});
