# `@moonwitness/ui`

MoonWitness design tokens, reusable React controls/charts and typed, tree-shakeable icons. The stylesheet has no runtime dependency. Consumers that import React components must provide React 18 or newer; CSS-only consumers do not need React.

The control subpaths also require React 18 or newer. Radix-backed controls (`Button`, `Dialog`, `DropdownMenu`, `Label`, `Popover`, `Select`, `Sheet`, `Switch`, `Tabs`, and `Tooltip`) require the optional `radix-ui` 1.6+ peer when imported. `Command` requires the optional `cmdk` 1.1+ peer. Toast exports Sonner's `toast` API and a `ToastHost`; mount the host once in the app root and provide `sonner` 2+. Consumers importing only static tokens/assets do not need these runtimes.

Common app-level controls (`Command`, `Label`, `Popover`, `Sheet`, `Switch`, and `Textarea`) are available as stable public subpaths. They provide presentation and accessibility primitives only; they do not own application navigation, API state, or business rules.

Composable, presentation-only building blocks are available as direct subpaths: `components/field`, `skeleton`, `empty-state`, `page-header`, `panel`, `toolbar`, `pagination`, and `table`. They do not fetch data or encode model/business rules. `Field` takes a labeled form control and connects its generated help/error IDs; `Pagination` is controlled with `page`, `pageCount`, and `onPageChange`.

`components/chart` exports dependency-free responsive SVG `BarChart` and `LineChart` primitives. Data is passed in by the application; loading, error, and empty states are explicit props. Each chart provides SVG titles, a legend where applicable, and a visually hidden semantic table alternative. Pass `locale` or `renderValue` for application-specific number formatting. Date/time labels should be formatted by the caller with its explicit locale and timezone so the chart never guesses a user profile preference.

Import an icon from its own subpath to keep unrelated icons out of the application bundle:

```tsx
import { UserIcon } from '@moonwitness/ui/icons/user';

<UserIcon size={20} title="User" />;
```

Icons are decorative and hidden from assistive technology by default. Pass `title` when the icon conveys information without adjacent text.

## Stylesheet

Import the public token entry once, before component styles:

```css
@import '@moonwitness/ui/styles/tokens.css';
```

The stylesheet defines semantic custom properties on `:root` and switches their light/dark surface mappings under `.dark`. It does not set global element styles, load fonts over the network, or require Tailwind. Applications may map these variables to their styling framework without copying the token values.

Semantic component rules are scoped to `.mw-ui-*` classes inside the `components` cascade layer. Import tokens before `components.css`; consumer utility styles outside that layer can override package defaults. Some Radix/command controls use Tailwind utility classes for state and transitions, so Tailwind v4 consumers must include the package's `dist` files as a source (for a local install, for example `@source "../node_modules/@moonwitness/ui/dist";`). Both CSS entry points are explicitly exported and declared as package side effects so bundlers retain them. The JavaScript surface has no aggregate component barrel: direct component and icon subpaths are the stable import contract. Internal `dist` paths are not public APIs.

### Compatibility and releases

The package follows SemVer after stable `1.0.0`; while the version includes an `-rc` prerelease, consumers should pin the exact prerelease and expect API review before stable release. Adding an optional prop or a new subpath is additive. Removing/renaming exports, changing required props or accessibility semantics, changing CSS token meaning, or raising peer/runtime minimums is breaking and requires a major release after stable. Peer ranges are React `>=18`, optional `cmdk >=1.1.1`, `radix-ui >=1.6.7`, and `sonner >=2`; only importing the associated subpath requires its peer. Node `>=20` is the supported tooling/runtime baseline. Import maps/exports and types are verified by the package test suite and tarball smoke check.

See [the token guide](./TOKENS.md) for semantic rules, measured contrast, motion, and chart color use.
