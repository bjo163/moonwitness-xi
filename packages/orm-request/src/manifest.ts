import { defineAddon, ref, seed } from '@moonwitness/orm';
import { ModelAccess } from '@moonwitness/orm-base';
import { WorkflowDefinition } from '@moonwitness/orm-workflow';
import { NotificationTemplate } from '@moonwitness/orm-notification';
import { PurchaseRequest } from './models.js';
import { views } from './views.js';

const purchaseApproval = {
  startState: 'draft',
  startRoles: ['user', 'system'],
  timeoutMinutes: 10080,
  resourceModels: [PurchaseRequest.modelName],
  transitions: [
    {
      action: 'submit',
      from: 'draft',
      to: 'submitted',
      roles: ['user', 'superadmin', 'system'],
      notifyStarter: 'request.submitted',
    },
    {
      action: 'approve',
      from: 'submitted',
      to: 'approved',
      roles: ['superadmin', 'system'],
      requiredApprovals: 1,
      requireDifferentActor: true,
      notifyStarter: 'request.approved',
    },
    {
      action: 'reject',
      from: 'submitted',
      to: 'rejected',
      roles: ['superadmin', 'system'],
      notifyStarter: 'request.rejected',
    },
  ],
};

export const manifest = defineAddon({
  name: 'request',
  version: '1.0.0',
  depends: ['base', 'jobs', 'notification', 'workflow'],
  models: [PurchaseRequest],
  data: [
    seed(ModelAccess, 'request.access_user_purchase_request', {
      group: ref('base.group_user'),
      model_name: PurchaseRequest.modelName,
      read: true,
      create: true,
      write: true,
      unlink: false,
    }),
    seed(WorkflowDefinition, 'request.workflow_purchase_approval_v1', {
      code: 'request.purchase_approval',
      version: 1,
      name: 'Purchase request approval',
      config: JSON.stringify(purchaseApproval),
    }),
    seed(NotificationTemplate, 'request.notification_submitted', {
      code: 'request.submitted',
      channel: 'in_app',
      title: 'Request submitted',
      body: 'A purchase request is ready for review.',
    }),
    seed(NotificationTemplate, 'request.notification_approved', {
      code: 'request.approved',
      channel: 'in_app',
      title: 'Request approved',
      body: 'Your purchase request was approved.',
    }),
    seed(NotificationTemplate, 'request.notification_rejected', {
      code: 'request.rejected',
      channel: 'in_app',
      title: 'Request declined',
      body: 'Your purchase request was declined.',
    }),
    seed(PurchaseRequest, 'request.example_laptop', {
      title: 'Laptop replacement',
      description: 'Replace an aging support workstation.',
      amount_minor: 1250000,
      currency: ref('base.currency_usd'),
      company: ref('base.company_default'),
      vendor: ref('base.partner_acme'),
    }),
    seed(PurchaseRequest, 'request.example_training', {
      title: 'Security training',
      description: 'Annual security awareness training for the support team.',
      amount_minor: 45000,
      currency: ref('base.currency_usd'),
      company: ref('base.company_default'),
    }),
  ],
  views,
  menus: [
    {
      model: PurchaseRequest.modelName,
      label: 'Purchase Requests',
      group: 'Workspace',
      sequence: 24,
    },
  ],
});
