# Purchase request example addon

`@moonwitness/orm-request` is a small reference business addon. It demonstrates how an addon can add a company-scoped model, generated Board list/form views, menu metadata, model access, deterministic examples, notification templates, and a workflow definition without adding request-specific API routes or changing the ORM core.

## Model and security

The `request.purchase` model stores a title, business reason, amount in the currency's minor units, company, and optional vendor. The immutable standard `create_uid` audit field identifies the requester, so callers cannot create a request on behalf of another user by assigning a requester relation. Its company relation makes the API's existing company record rule apply automatically. The standard `user` group can read, create, and edit requests inside its active company; unlink is denied. The model deliberately has no duplicate approval-status field: the workflow instance is the authoritative approval state and event history.

## Example approval

The manifest seeds two draft request examples and a `request.purchase_approval` workflow definition. Users can start the workflow on a request through the authenticated generic workflow API. The definition supports submit, approve, and reject; approval is limited to superadmin/system roles and forbids the requester from approving their own request. Workflow events and approvals stay in the reusable workflow addon.

Three in-app notification templates cover submitted/approved/rejected states. The workflow definition opts into starter notifications for each successful transition; workflow events, state changes, and outbox events commit atomically, then delivery uses the shared consumer and recipient preferences. The addon does not send email or fabricate notification/history rows during installation.

## Install and verify

The API installs this addon with the runtime addon set. Its manifest depends on `base`, `notification`, and `workflow`; addon dependency sorting determines install order. The Board uses the generated model view and menu metadata. The generic API exposes ordinary model CRUD and `/api/workflows/instances` for approval actions/history; no special request endpoint is required.

Run `pnpm --filter @moonwitness/orm-request test` for the isolated addon contract, or `pnpm test:addon-conformance` for workspace-wide manifest, seed, and reinstall checks. The sample rows are safe demonstration data and can be edited without being overwritten on restart.
