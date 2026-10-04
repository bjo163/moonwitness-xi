# `@moonwitness/ui`

MoonWitness design tokens and typed, tree-shakeable React icons. The stylesheet has no runtime dependency. Consumers that import icon components must provide React 18 or newer; CSS-only consumers do not need React.

The base control subpaths also require React 18 or newer. Radix-backed controls (`Button`, `Dialog`, `DropdownMenu`, `Select`, `Tabs`, and `Tooltip`) require the optional `radix-ui` 1.6+ peer when imported. Toast exports Sonner's `toast` API and a `ToastHost`; mount the host once in the app root and provide `sonner` 2+. Consumers importing only static tokens/assets do not need either runtime.

Composable, presentation-only building blocks are available as direct subpaths: `components/field`, `skeleton`, `empty-state`, `page-header`, `panel`, `toolbar`, `pagination`, and `table`. They do not fetch data or encode model/business rules. `Field` takes a labeled form control and connects its generated help/error IDs; `Pagination` is controlled with `page`, `pageCount`, and `onPageChange`.

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

Component rules are scoped to `.mw-ui-*` classes inside the `components` cascade layer. Import tokens before `components.css`; consumer utility styles outside that layer can override package defaults. Both CSS entry points are explicitly exported and declared as package side effects so bundlers retain them. The JavaScript surface has no aggregate component barrel: direct component and icon subpaths are the stable import contract. Internal `dist` paths are not public APIs.

### Compatibility and releases

The package follows SemVer after stable `1.0.0`; while the version includes an `-rc` prerelease, consumers should pin the exact prerelease and expect API review before stable release. Adding an optional prop or a new subpath is additive. Removing/renaming exports, changing required props or accessibility semantics, changing CSS token meaning, or raising peer/runtime minimums is breaking and requires a major release after stable. Peer ranges are React `>=18`, optional `radix-ui >=1.6.7`, and optional `sonner >=2`; only importing the associated subpath requires its peer. Node `>=20` is the supported tooling/runtime baseline. Import maps/exports and types are verified by the package test suite and tarball smoke check.

See [the token guide](./TOKENS.md) for semantic rules, measured contrast, motion, and chart color use.
