# MoonWitness icon inventory

`@moonwitness/assets/icons/*` contains original, generated MoonWitness SVG symbols. Every icon uses a 24×24 viewBox, 1.8-unit rounded stroke, and `currentColor`; dimensions and names are recorded in the package manifest. The source definitions live in `packages/assets/scripts/generate.mjs` so regeneration does not require manually editing exported copies.

## Domain icons

| Export             | Meaning                             |
| ------------------ | ----------------------------------- |
| `user.svg`         | User account                        |
| `partner.svg`      | Person or contact partner           |
| `company.svg`      | Company or tenant                   |
| `team.svg`         | Team or group                       |
| `addon.svg`        | Addon/module                        |
| `model.svg`        | Data model/table                    |
| `field.svg`        | Model field                         |
| `relation.svg`     | Relationship between records/models |
| `activity.svg`     | Activity or timeline event          |
| `attachment.svg`   | File attachment                     |
| `notification.svg` | Notification                        |
| `jobs.svg`         | Background jobs/queue               |
| `workflow.svg`     | Workflow/state transition           |
| `security.svg`     | Security policy/access              |

## Common actions

`search`, `add`, `edit`, `delete`, `settings`, `calendar`, `filter`, `refresh`, `external-link`, and `menu` provide reusable actions. Keep labels and accessible names in the consuming UI so each symbol is interpreted in its real context.

The [contact sheet](assets/icon-contact-sheet.png) renders all 24 symbols at 16, 20, 24 and 32 px on light and dark surfaces. Icons are built from original geometric paths; the current set uses no IDs, gradients, masks, scripts, external URLs, or borrowed artwork. The package validator rejects those executable/external SVG constructs and checks any future local reference IDs.

SVG roots include a descriptive title for static image consumers. For theme-aware inline rendering, use the typed wrappers in `@moonwitness/ui` when available; an SVG loaded as an `<img>` cannot inherit the host element's `currentColor`, so it uses the SVG initial color instead.
