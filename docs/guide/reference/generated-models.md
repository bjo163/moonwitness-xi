# Generated model and addon reference

Source fingerprint: `e9015b8b1b3229cec6171c6f43660984ac8edb4bdd258c1b881f8cab53011d74`. Seed values and field defaults are intentionally omitted.

## Addon `auth`

Version: `1.0.0`; dependencies: `base`.

Models: 1; declared views: 0; menu entries: 0; seed rows: 0.

| Model                | Table                 | Field                  | Kind      | Required | Optional | Default    | Relation    |
| -------------------- | --------------------- | ---------------------- | --------- | -------- | -------- | ---------- | ----------- |
| `auth.refresh_token` | `auth_refresh_tokens` | `expires_at`           | string    | Yes      | No       | No         | —           |
| `auth.refresh_token` | `auth_refresh_tokens` | `family`               | string    | Yes      | No       | No         | —           |
| `auth.refresh_token` | `auth_refresh_tokens` | `revoked`              | boolean   | No       | Yes      | [redacted] | —           |
| `auth.refresh_token` | `auth_refresh_tokens` | `rotated_at`           | string    | No       | Yes      | No         | —           |
| `auth.refresh_token` | `auth_refresh_tokens` | `rotation_lease_until` | string    | No       | Yes      | No         | —           |
| `auth.refresh_token` | `auth_refresh_tokens` | `token_hash`           | string    | Yes      | No       | No         | —           |
| `auth.refresh_token` | `auth_refresh_tokens` | `user`                 | belongsTo | Yes      | No       | No         | `base.user` |
| `auth.refresh_token` | `auth_refresh_tokens` | `user_agent`           | string    | No       | Yes      | No         | —           |

### Menus and seed coverage

| Menu model | Label | Group | Sequence | Visibility |
| ---------- | ----- | ----- | -------: | ---------- |

## Addon `base`

Version: `1.0.0`; dependencies: none.

Models: 22; declared views: 21; menu entries: 22; seed rows: 736.

| Model                        | Table                    | Field                  | Kind      | Required | Optional | Default    | Relation                |
| ---------------------------- | ------------------------ | ---------------------- | --------- | -------- | -------- | ---------- | ----------------------- |
| `base.access_group`          | `access_groups`          | `code`                 | string    | Yes      | No       | No         | —                       |
| `base.access_group`          | `access_groups`          | `description`          | text      | No       | Yes      | No         | —                       |
| `base.access_group`          | `access_groups`          | `name`                 | string    | Yes      | No       | No         | —                       |
| `base.activity`              | `activities`             | `activity_type`        | enum      | No       | Yes      | [redacted] | —                       |
| `base.activity`              | `activities`             | `assigned_to`          | belongsTo | No       | Yes      | No         | `base.user`             |
| `base.activity`              | `activities`             | `deadline`             | string    | No       | Yes      | No         | —                       |
| `base.activity`              | `activities`             | `note`                 | text      | No       | Yes      | No         | —                       |
| `base.activity`              | `activities`             | `resource_id`          | integer   | Yes      | No       | No         | —                       |
| `base.activity`              | `activities`             | `resource_model`       | string    | Yes      | No       | No         | —                       |
| `base.activity`              | `activities`             | `state`                | enum      | No       | Yes      | [redacted] | —                       |
| `base.activity`              | `activities`             | `summary`              | string    | Yes      | No       | No         | —                       |
| `base.attachment`            | `attachments`            | `checksum`             | string    | No       | Yes      | No         | —                       |
| `base.attachment`            | `attachments`            | `mimetype`             | string    | Yes      | No       | No         | —                       |
| `base.attachment`            | `attachments`            | `name`                 | string    | Yes      | No       | No         | —                       |
| `base.attachment`            | `attachments`            | `resource_id`          | integer   | Yes      | No       | No         | —                       |
| `base.attachment`            | `attachments`            | `resource_model`       | string    | Yes      | No       | No         | —                       |
| `base.attachment`            | `attachments`            | `size_bytes`           | integer   | Yes      | No       | No         | —                       |
| `base.attachment`            | `attachments`            | `storage_key`          | string    | Yes      | No       | No         | —                       |
| `base.audit_log`             | `audit_logs`             | `actor_id`             | integer   | No       | Yes      | No         | —                       |
| `base.audit_log`             | `audit_logs`             | `changes`              | text      | Yes      | No       | No         | —                       |
| `base.audit_log`             | `audit_logs`             | `model`                | string    | Yes      | No       | No         | —                       |
| `base.audit_log`             | `audit_logs`             | `operation`            | string    | Yes      | No       | No         | —                       |
| `base.audit_log`             | `audit_logs`             | `record_id`            | integer   | Yes      | No       | No         | —                       |
| `base.bank`                  | `banks`                  | `bic`                  | string    | No       | Yes      | No         | —                       |
| `base.bank`                  | `banks`                  | `code`                 | string    | No       | Yes      | No         | —                       |
| `base.bank`                  | `banks`                  | `country`              | belongsTo | No       | Yes      | No         | `base.country`          |
| `base.bank`                  | `banks`                  | `name`                 | string    | Yes      | No       | No         | —                       |
| `base.bank`                  | `banks`                  | `phone`                | string    | No       | Yes      | No         | —                       |
| `base.bank`                  | `banks`                  | `website`              | string    | No       | Yes      | No         | —                       |
| `base.company`               | `companies`              | `city`                 | string    | No       | Yes      | No         | —                       |
| `base.company`               | `companies`              | `country`              | belongsTo | No       | Yes      | No         | `base.country`          |
| `base.company`               | `companies`              | `currency`             | belongsTo | No       | Yes      | No         | `base.currency`         |
| `base.company`               | `companies`              | `email`                | string    | No       | Yes      | No         | —                       |
| `base.company`               | `companies`              | `language`             | belongsTo | No       | Yes      | No         | `base.language`         |
| `base.company`               | `companies`              | `name`                 | string    | Yes      | No       | No         | —                       |
| `base.company`               | `companies`              | `phone`                | string    | No       | Yes      | No         | —                       |
| `base.company`               | `companies`              | `postal_code`          | string    | No       | Yes      | No         | —                       |
| `base.company`               | `companies`              | `street`               | string    | No       | Yes      | No         | —                       |
| `base.company`               | `companies`              | `timezone`             | string    | No       | Yes      | [redacted] | —                       |
| `base.company`               | `companies`              | `website`              | string    | No       | Yes      | No         | —                       |
| `base.company_membership`    | `company_memberships`    | `company`              | belongsTo | Yes      | No       | No         | `base.company`          |
| `base.company_membership`    | `company_memberships`    | `is_default`           | boolean   | No       | Yes      | [redacted] | —                       |
| `base.company_membership`    | `company_memberships`    | `user`                 | belongsTo | Yes      | No       | No         | `base.user`             |
| `base.country`               | `countries`              | `code`                 | string    | Yes      | No       | No         | —                       |
| `base.country`               | `countries`              | `code_alpha3`          | string    | No       | Yes      | No         | —                       |
| `base.country`               | `countries`              | `name`                 | string    | Yes      | No       | No         | —                       |
| `base.country`               | `countries`              | `phone_code`           | string    | No       | Yes      | No         | —                       |
| `base.country`               | `countries`              | `vat_label`            | string    | No       | Yes      | No         | —                       |
| `base.country_state`         | `country_states`         | `code`                 | string    | Yes      | No       | No         | —                       |
| `base.country_state`         | `country_states`         | `country`              | belongsTo | Yes      | No       | No         | `base.country`          |
| `base.country_state`         | `country_states`         | `name`                 | string    | Yes      | No       | No         | —                       |
| `base.country_state`         | `country_states`         | `type`                 | string    | No       | Yes      | No         | —                       |
| `base.currency`              | `currencies`             | `code`                 | string    | Yes      | No       | No         | —                       |
| `base.currency`              | `currencies`             | `name`                 | string    | Yes      | No       | No         | —                       |
| `base.currency`              | `currencies`             | `symbol`               | string    | No       | Yes      | No         | —                       |
| `base.group_membership`      | `group_memberships`      | `group`                | belongsTo | Yes      | No       | No         | `base.access_group`     |
| `base.group_membership`      | `group_memberships`      | `user`                 | belongsTo | Yes      | No       | No         | `base.user`             |
| `base.language`              | `languages`              | `code`                 | string    | Yes      | No       | No         | —                       |
| `base.language`              | `languages`              | `name`                 | string    | Yes      | No       | No         | —                       |
| `base.model_access`          | `model_access`           | `create`               | boolean   | No       | Yes      | [redacted] | —                       |
| `base.model_access`          | `model_access`           | `group`                | belongsTo | Yes      | No       | No         | `base.access_group`     |
| `base.model_access`          | `model_access`           | `model_name`           | string    | Yes      | No       | No         | —                       |
| `base.model_access`          | `model_access`           | `read`                 | boolean   | No       | Yes      | [redacted] | —                       |
| `base.model_access`          | `model_access`           | `unlink`               | boolean   | No       | Yes      | [redacted] | —                       |
| `base.model_access`          | `model_access`           | `write`                | boolean   | No       | Yes      | [redacted] | —                       |
| `base.partner`               | `partners`               | `city`                 | string    | No       | Yes      | No         | —                       |
| `base.partner`               | `partners`               | `company`              | belongsTo | No       | Yes      | No         | `base.company`          |
| `base.partner`               | `partners`               | `country`              | belongsTo | No       | Yes      | No         | `base.country`          |
| `base.partner`               | `partners`               | `email`                | string    | No       | Yes      | No         | —                       |
| `base.partner`               | `partners`               | `is_company`           | boolean   | No       | Yes      | [redacted] | —                       |
| `base.partner`               | `partners`               | `is_customer`          | boolean   | No       | Yes      | [redacted] | —                       |
| `base.partner`               | `partners`               | `is_supplier`          | boolean   | No       | Yes      | [redacted] | —                       |
| `base.partner`               | `partners`               | `job_title`            | string    | No       | Yes      | No         | —                       |
| `base.partner`               | `partners`               | `mobile`               | string    | No       | Yes      | No         | —                       |
| `base.partner`               | `partners`               | `name`                 | string    | Yes      | No       | No         | —                       |
| `base.partner`               | `partners`               | `notes`                | text      | No       | Yes      | No         | —                       |
| `base.partner`               | `partners`               | `parent`               | belongsTo | No       | Yes      | No         | `base.partner`          |
| `base.partner`               | `partners`               | `phone`                | string    | No       | Yes      | No         | —                       |
| `base.partner`               | `partners`               | `postal_code`          | string    | No       | Yes      | No         | —                       |
| `base.partner`               | `partners`               | `state`                | belongsTo | No       | Yes      | No         | `base.country_state`    |
| `base.partner`               | `partners`               | `street`               | string    | No       | Yes      | No         | —                       |
| `base.partner`               | `partners`               | `vat`                  | string    | No       | Yes      | No         | —                       |
| `base.partner`               | `partners`               | `website`              | string    | No       | Yes      | No         | —                       |
| `base.partner_address`       | `partner_addresses`      | `address_type`         | enum      | No       | Yes      | [redacted] | —                       |
| `base.partner_address`       | `partner_addresses`      | `city`                 | string    | Yes      | No       | No         | —                       |
| `base.partner_address`       | `partner_addresses`      | `country`              | belongsTo | No       | Yes      | No         | `base.country`          |
| `base.partner_address`       | `partner_addresses`      | `is_primary`           | boolean   | No       | Yes      | [redacted] | —                       |
| `base.partner_address`       | `partner_addresses`      | `label`                | string    | Yes      | No       | No         | —                       |
| `base.partner_address`       | `partner_addresses`      | `partner`              | belongsTo | Yes      | No       | No         | `base.partner`          |
| `base.partner_address`       | `partner_addresses`      | `postal_code`          | string    | No       | Yes      | No         | —                       |
| `base.partner_address`       | `partner_addresses`      | `state`                | belongsTo | No       | Yes      | No         | `base.country_state`    |
| `base.partner_address`       | `partner_addresses`      | `street`               | string    | Yes      | No       | No         | —                       |
| `base.partner_address`       | `partner_addresses`      | `street2`              | string    | No       | Yes      | No         | —                       |
| `base.partner_bank`          | `partner_banks`          | `acc_holder_name`      | string    | No       | Yes      | No         | —                       |
| `base.partner_bank`          | `partner_banks`          | `acc_number`           | string    | Yes      | No       | No         | —                       |
| `base.partner_bank`          | `partner_banks`          | `bank`                 | belongsTo | No       | Yes      | No         | `base.bank`             |
| `base.partner_bank`          | `partner_banks`          | `company`              | belongsTo | No       | Yes      | No         | `base.company`          |
| `base.partner_bank`          | `partner_banks`          | `currency`             | belongsTo | No       | Yes      | No         | `base.currency`         |
| `base.partner_bank`          | `partner_banks`          | `is_primary`           | boolean   | No       | Yes      | [redacted] | —                       |
| `base.partner_bank`          | `partner_banks`          | `partner`              | belongsTo | Yes      | No       | No         | `base.partner`          |
| `base.partner_bank`          | `partner_banks`          | `sanitized_acc_number` | string    | No       | Yes      | No         | —                       |
| `base.partner_category`      | `partner_categories`     | `code`                 | string    | Yes      | No       | No         | —                       |
| `base.partner_category`      | `partner_categories`     | `color`                | string    | No       | Yes      | [redacted] | —                       |
| `base.partner_category`      | `partner_categories`     | `description`          | text      | No       | Yes      | No         | —                       |
| `base.partner_category`      | `partner_categories`     | `name`                 | string    | Yes      | No       | No         | —                       |
| `base.partner_category_link` | `partner_category_links` | `category`             | belongsTo | Yes      | No       | No         | `base.partner_category` |
| `base.partner_category_link` | `partner_category_links` | `partner`              | belongsTo | Yes      | No       | No         | `base.partner`          |
| `base.sequence`              | `sequences`              | `code`                 | string    | Yes      | No       | No         | —                       |
| `base.sequence`              | `sequences`              | `name`                 | string    | No       | Yes      | No         | —                       |
| `base.sequence`              | `sequences`              | `next_number`          | integer   | No       | Yes      | [redacted] | —                       |
| `base.sequence`              | `sequences`              | `padding`              | integer   | No       | Yes      | [redacted] | —                       |
| `base.sequence`              | `sequences`              | `prefix`               | string    | No       | Yes      | [redacted] | —                       |
| `base.tag`                   | `tags`                   | `color`                | string    | No       | Yes      | [redacted] | —                       |
| `base.tag`                   | `tags`                   | `description`          | text      | No       | Yes      | No         | —                       |
| `base.tag`                   | `tags`                   | `name`                 | string    | Yes      | No       | No         | —                       |
| `base.tag_link`              | `tag_links`              | `resource_id`          | integer   | Yes      | No       | No         | —                       |
| `base.tag_link`              | `tag_links`              | `resource_model`       | string    | Yes      | No       | No         | —                       |
| `base.tag_link`              | `tag_links`              | `tag`                  | belongsTo | Yes      | No       | No         | `base.tag`              |
| `base.user`                  | `users`                  | `language`             | belongsTo | No       | Yes      | No         | `base.language`         |
| `base.user`                  | `users`                  | `login`                | string    | Yes      | No       | No         | —                       |
| `base.user`                  | `users`                  | `partner`              | belongsTo | Yes      | No       | No         | `base.partner`          |
| `base.user`                  | `users`                  | `password`             | password  | No       | Yes      | No         | —                       |
| `base.user`                  | `users`                  | `role`                 | enum      | No       | Yes      | [redacted] | —                       |
| `base.user`                  | `users`                  | `timezone`             | string    | No       | Yes      | No         | —                       |

### Menus and seed coverage

| Menu model                   | Label                      | Group        | Sequence | Visibility       |
| ---------------------------- | -------------------------- | ------------ | -------: | ---------------- |
| `base.access_group`          | base.access_group          | Technical    |      420 | Development mode |
| `base.activity`              | Activities                 | Workspace    |       40 | Standard         |
| `base.attachment`            | Attachments                | Workspace    |       50 | Standard         |
| `base.audit_log`             | base.audit_log             | Technical    |      460 | Development mode |
| `base.bank`                  | base.bank                  | Finance      |      310 | Development mode |
| `base.company`               | Companies                  | Organization |       20 | Standard         |
| `base.company_membership`    | base.company_membership    | Technical    |      450 | Development mode |
| `base.country`               | base.country               | Localization |      210 | Development mode |
| `base.country_state`         | base.country_state         | Localization |      220 | Development mode |
| `base.currency`              | base.currency              | Localization |      230 | Development mode |
| `base.group_membership`      | base.group_membership      | Technical    |      430 | Development mode |
| `base.language`              | base.language              | Localization |      240 | Development mode |
| `base.model_access`          | base.model_access          | Technical    |      440 | Development mode |
| `base.partner`               | Partners                   | Workspace    |       10 | Standard         |
| `base.partner_address`       | base.partner_address       | Contacts     |      110 | Development mode |
| `base.partner_bank`          | base.partner_bank          | Finance      |      320 | Development mode |
| `base.partner_category`      | base.partner_category      | Contacts     |      120 | Development mode |
| `base.partner_category_link` | base.partner_category_link | Contacts     |      130 | Development mode |
| `base.sequence`              | base.sequence              | Technical    |      410 | Development mode |
| `base.tag`                   | Tags                       | Workspace    |       60 | Standard         |
| `base.tag_link`              | base.tag_link              | Technical    |      390 | Development mode |
| `base.user`                  | Users                      | Organization |       30 | Standard         |

- Seed coverage: `base.access_group` has 3 declared seed row(s); seed values are not included.
- Seed coverage: `base.activity` has 1 declared seed row(s); seed values are not included.
- Seed coverage: `base.attachment` has 1 declared seed row(s); seed values are not included.
- Seed coverage: `base.bank` has 8 declared seed row(s); seed values are not included.
- Seed coverage: `base.company` has 1 declared seed row(s); seed values are not included.
- Seed coverage: `base.company_membership` has 2 declared seed row(s); seed values are not included.
- Seed coverage: `base.country` has 249 declared seed row(s); seed values are not included.
- Seed coverage: `base.country_state` has 444 declared seed row(s); seed values are not included.
- Seed coverage: `base.currency` has 1 declared seed row(s); seed values are not included.
- Seed coverage: `base.group_membership` has 1 declared seed row(s); seed values are not included.
- Seed coverage: `base.language` has 1 declared seed row(s); seed values are not included.
- Seed coverage: `base.model_access` has 1 declared seed row(s); seed values are not included.
- Seed coverage: `base.partner` has 10 declared seed row(s); seed values are not included.
- Seed coverage: `base.partner_address` has 1 declared seed row(s); seed values are not included.
- Seed coverage: `base.partner_bank` has 2 declared seed row(s); seed values are not included.
- Seed coverage: `base.partner_category` has 2 declared seed row(s); seed values are not included.
- Seed coverage: `base.partner_category_link` has 2 declared seed row(s); seed values are not included.
- Seed coverage: `base.sequence` has 2 declared seed row(s); seed values are not included.
- Seed coverage: `base.tag` has 1 declared seed row(s); seed values are not included.
- Seed coverage: `base.tag_link` has 1 declared seed row(s); seed values are not included.
- Seed coverage: `base.user` has 2 declared seed row(s); seed values are not included.

### Seeded model access rules

| Group reference   | Model          | Read | Create | Write | Delete |
| ----------------- | -------------- | ---- | ------ | ----- | ------ |
| `base.group_user` | `base.partner` | Yes  | No     | No    | No     |

## Addon `jobs`

Version: `1.0.0`; dependencies: `base`.

Models: 4; declared views: 0; menu entries: 0; seed rows: 1.

| Model               | Table           | Field                | Kind      | Required | Optional | Default    | Relation       |
| ------------------- | --------------- | -------------------- | --------- | -------- | -------- | ---------- | -------------- |
| `base.cron`         | `crons`         | `code`               | string    | Yes      | No       | No         | —              |
| `base.cron`         | `crons`         | `company`            | belongsTo | No       | Yes      | No         | `base.company` |
| `base.cron`         | `crons`         | `concurrency_policy` | enum      | No       | Yes      | [redacted] | —              |
| `base.cron`         | `crons`         | `cron_expression`    | string    | Yes      | No       | No         | —              |
| `base.cron`         | `crons`         | `enabled`            | boolean   | No       | Yes      | [redacted] | —              |
| `base.cron`         | `crons`         | `handler`            | string    | Yes      | No       | No         | —              |
| `base.cron`         | `crons`         | `handler_version`    | integer   | No       | Yes      | [redacted] | —              |
| `base.cron`         | `crons`         | `max_catch_up`       | integer   | No       | Yes      | [redacted] | —              |
| `base.cron`         | `crons`         | `misfire_policy`     | enum      | No       | Yes      | [redacted] | —              |
| `base.cron`         | `crons`         | `name`               | string    | Yes      | No       | No         | —              |
| `base.cron`         | `crons`         | `next_run_at`        | string    | Yes      | No       | No         | —              |
| `base.cron`         | `crons`         | `payload`            | text      | No       | Yes      | [redacted] | —              |
| `base.cron`         | `crons`         | `requested_by`       | belongsTo | No       | Yes      | No         | `base.user`    |
| `base.cron`         | `crons`         | `timezone`           | string    | No       | Yes      | [redacted] | —              |
| `base.job`          | `jobs`          | `attempts`           | integer   | No       | Yes      | [redacted] | —              |
| `base.job`          | `jobs`          | `available_at`       | string    | Yes      | No       | No         | —              |
| `base.job`          | `jobs`          | `cancel_requested`   | boolean   | No       | Yes      | [redacted] | —              |
| `base.job`          | `jobs`          | `company`            | belongsTo | No       | Yes      | No         | `base.company` |
| `base.job`          | `jobs`          | `cron_id`            | integer   | No       | Yes      | No         | —              |
| `base.job`          | `jobs`          | `fencing_token`      | integer   | No       | Yes      | [redacted] | —              |
| `base.job`          | `jobs`          | `handler`            | string    | Yes      | No       | No         | —              |
| `base.job`          | `jobs`          | `handler_version`    | integer   | No       | Yes      | [redacted] | —              |
| `base.job`          | `jobs`          | `idempotency_key`    | string    | No       | Yes      | No         | —              |
| `base.job`          | `jobs`          | `lease_owner`        | string    | No       | Yes      | No         | —              |
| `base.job`          | `jobs`          | `lease_until`        | string    | No       | Yes      | No         | —              |
| `base.job`          | `jobs`          | `max_attempts`       | integer   | No       | Yes      | [redacted] | —              |
| `base.job`          | `jobs`          | `payload`            | text      | No       | Yes      | [redacted] | —              |
| `base.job`          | `jobs`          | `priority`           | integer   | No       | Yes      | [redacted] | —              |
| `base.job`          | `jobs`          | `requested_by`       | belongsTo | No       | Yes      | No         | `base.user`    |
| `base.job`          | `jobs`          | `schedule_key`       | string    | No       | Yes      | No         | —              |
| `base.job`          | `jobs`          | `status`             | enum      | No       | Yes      | [redacted] | —              |
| `base.job_run`      | `job_runs`      | `attempt`            | integer   | Yes      | No       | No         | —              |
| `base.job_run`      | `job_runs`      | `error_code`         | string    | No       | Yes      | No         | —              |
| `base.job_run`      | `job_runs`      | `error_message`      | text      | No       | Yes      | No         | —              |
| `base.job_run`      | `job_runs`      | `finished_at`        | string    | No       | Yes      | No         | —              |
| `base.job_run`      | `job_runs`      | `job`                | belongsTo | Yes      | No       | No         | `base.job`     |
| `base.job_run`      | `job_runs`      | `result`             | text      | No       | Yes      | No         | —              |
| `base.job_run`      | `job_runs`      | `started_at`         | string    | Yes      | No       | No         | —              |
| `base.job_run`      | `job_runs`      | `status`             | enum      | Yes      | No       | No         | —              |
| `base.job_run`      | `job_runs`      | `worker_id`          | string    | Yes      | No       | No         | —              |
| `base.outbox_event` | `outbox_events` | `actor`              | belongsTo | No       | Yes      | No         | `base.user`    |
| `base.outbox_event` | `outbox_events` | `aggregate_id`       | integer   | Yes      | No       | No         | —              |
| `base.outbox_event` | `outbox_events` | `aggregate_model`    | string    | Yes      | No       | No         | —              |
| `base.outbox_event` | `outbox_events` | `attempts`           | integer   | No       | Yes      | [redacted] | —              |
| `base.outbox_event` | `outbox_events` | `available_at`       | string    | Yes      | No       | No         | —              |
| `base.outbox_event` | `outbox_events` | `company`            | belongsTo | No       | Yes      | No         | `base.company` |
| `base.outbox_event` | `outbox_events` | `created_at`         | string    | No       | Yes      | [redacted] | —              |
| `base.outbox_event` | `outbox_events` | `event_type`         | string    | Yes      | No       | No         | —              |
| `base.outbox_event` | `outbox_events` | `fencing_token`      | integer   | No       | Yes      | [redacted] | —              |
| `base.outbox_event` | `outbox_events` | `last_error`         | text      | No       | Yes      | No         | —              |
| `base.outbox_event` | `outbox_events` | `lease_owner`        | string    | No       | Yes      | No         | —              |
| `base.outbox_event` | `outbox_events` | `lease_until`        | string    | No       | Yes      | No         | —              |
| `base.outbox_event` | `outbox_events` | `max_attempts`       | integer   | No       | Yes      | [redacted] | —              |
| `base.outbox_event` | `outbox_events` | `payload`            | text      | Yes      | No       | No         | —              |
| `base.outbox_event` | `outbox_events` | `published_at`       | string    | No       | Yes      | No         | —              |
| `base.outbox_event` | `outbox_events` | `status`             | enum      | No       | Yes      | [redacted] | —              |

### Menus and seed coverage

| Menu model | Label | Group | Sequence | Visibility |
| ---------- | ----- | ----- | -------: | ---------- |

- Seed coverage: `base.cron` has 1 declared seed row(s); seed values are not included.
