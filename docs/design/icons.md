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

The [current contact sheet](assets/icon-contact-sheet-current.png) renders all canonical symbols at 16, 20, 24 and 32 px on light and dark surfaces. Icons are built from original geometric paths; the current set uses no IDs, gradients, masks, scripts, external URLs, or borrowed artwork. The package validator rejects those executable/external SVG constructs and checks any future local reference IDs.

SVG roots include a descriptive title for static image consumers. For theme-aware inline rendering, use the typed wrappers in `@moonwitness/ui` when available; an SVG loaded as an `<img>` cannot inherit the host element's `currentColor`, so it uses the SVG initial color instead.

## Board and Home migration inventory

Source scan on 2026-10-24 found **20 TSX files importing directly from `lucide-react`**, with **79 distinct icon component names**. This records the migration surface; it does not claim these icons are already canonical. Prefer an existing semantic export when its silhouette and meaning match. Add a canonical SVG for missing actions or concepts, then migrate and visually compare the source and generated wrapper before removing the direct import.

| Consumer                                                    | Directly imported icon components                                                                                                                                                                                            |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/board/src/board-pages/auth-page.tsx`                  | `ArrowRight`, `Loader2`                                                                                                                                                                                                      |
| `apps/board/src/board-pages/knowledge-page.tsx`             | `BookOpen`, `GitBranch`, `Search`                                                                                                                                                                                            |
| `apps/board/src/board-pages/profile-page.tsx`               | `Building2`, `Contact`, `Mail`, `ShieldCheck`, `UserRound`                                                                                                                                                                   |
| `apps/board/src/board-pages/settings-page.tsx`              | `Check`, `MonitorCog`, `Moon`, `Sun`                                                                                                                                                                                         |
| `apps/board/src/board-pages/story-workbench-page.tsx`       | `AlertTriangle`, `BookOpenCheck`, `Save`                                                                                                                                                                                     |
| `apps/board/src/board-pages/whatsapp-page.tsx`              | `Paperclip`, `Send`, `Smartphone`, `Users`, `Wifi`, `WifiOff`                                                                                                                                                                |
| `apps/board/src/components/layout/activity-bell.tsx`        | `Calendar`, `CalendarClock`, `Check`, `CheckSquare`, `ExternalLink`, `Mail`, `Phone`                                                                                                                                         |
| `apps/board/src/components/layout/app-shell.tsx`            | `BookOpenCheck`, `Building2`, `Calendar`, `Check`, `Code2`, `Globe`, `Keyboard`, `LogOut`, `Menu`, `MessageCircle`, `Moon`, `Network`, `Search`, `Sun`, `User`, `Users`                                                      |
| `apps/board/src/components/layout/breadcrumbs.tsx`          | `ChevronRight`                                                                                                                                                                                                               |
| `apps/board/src/components/layout/cron-scheduler-panel.tsx` | `AlertTriangle`, `Calendar`, `CheckCircle2`, `Clock`, `Pause`, `Play`, `Plus`, `RefreshCw`, `Server`                                                                                                                         |
| `apps/board/src/components/layout/notification-bell.tsx`    | `Bell`, `Check`, `Inbox`                                                                                                                                                                                                     |
| `apps/board/src/components/manga/shortcuts-dialog.tsx`      | `Keyboard`, `Sparkles`                                                                                                                                                                                                       |
| `apps/board/src/components/views/chatter.tsx`               | `Calendar`, `CheckCircle2`, `Clock`, `Download`, `File`, `FileArchive`, `FileCode`, `FileImage`, `FileText`, `History`, `Mail`, `MessageSquare`, `Paperclip`, `Phone`, `Plus`, `Trash2`, `UploadCloud`, `UserCheck`, `Zap`   |
| `apps/board/src/components/views/fields.tsx`                | `Check`, `ChevronsUpDown`, `X`                                                                                                                                                                                               |
| `apps/board/src/components/views/form-view.tsx`             | `Archive`, `ArrowLeft`, `Check`, `Loader2`, `Save`, `Trash2`, `Zap`                                                                                                                                                          |
| `apps/board/src/components/views/import-wizard-dialog.tsx`  | `AlertCircle`, `ArrowLeft`, `ArrowRight`, `Check`, `CheckCircle2`, `FileSpreadsheet`, `Loader2`, `RotateCcw`, `Upload`                                                                                                       |
| `apps/board/src/components/views/list-view.tsx`             | `Archive`, `ArrowDown`, `ArrowUp`, `ArrowUpDown`, `ChevronLeft`, `ChevronRight`, `ChevronsLeft`, `ChevronsRight`, `Columns3`, `Download`, `Filter`, `LayoutGrid`, `Loader2`, `Plus`, `Search`, `Table`, `Tag`, `Upload`, `X` |
| `apps/board/src/components/views/one2many-widget.tsx`       | `ExternalLink`, `Loader2`, `Plus`, `Trash2`                                                                                                                                                                                  |
| `apps/board/src/components/views/query-builder-dialog.tsx`  | `Bookmark`, `Check`, `Filter`, `Plus`, `RotateCcw`, `Sparkles`, `Trash2`                                                                                                                                                     |
| `apps/board/src/components/views/tags-widget.tsx`           | `Plus`, `Tag`, `X`                                                                                                                                                                                                           |

The existing canonical set already covers several common meanings (`ArrowRight`, `Archive`, `BookOpen`, `Building2` via company, `Calendar`, `Check`, `ExternalLink`, `Filter`, `Globe`, `Menu`, `Moon`, `Paperclip` via attachment, `Pause`, `Play`, `Plus`, `RefreshCw` via refresh, `Save`, `Search`, `ShieldCheck` via security, `Tag`, `Trash2` via delete, `Upload`, `User`, and `Users`). These are mapping candidates only: confirm the actual use and visual silhouette at each call site. Remaining concepts such as keyboard shortcuts, file types, messaging, device/network states, and layout controls need an explicit keep/add decision during migration rather than silent substitution.
