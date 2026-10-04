# Shared UI component exports

`@moonwitness/ui` exports each component through a stable subpath. Import `@moonwitness/ui/components.css` once after the token stylesheet. The stylesheet only defines `.mw-ui-*` classes; it does not reset global elements or require Tailwind.

```tsx
import '@moonwitness/ui/styles/tokens.css';
import '@moonwitness/ui/components.css';
import { Button } from '@moonwitness/ui/components/button';
import { Input } from '@moonwitness/ui/components/input';

<form>
  <Input name="email" type="email" autoComplete="email" required />
  <Button type="submit">Save</Button>
</form>;
```

The initial primitive set also exports native `Checkbox` and `SelectField` controls, a `Badge`, and a named `Avatar`. Native form controls keep browser keyboard, label, and submission behavior. `Button` preserves `button` semantics and supports Radix `Slot` composition with `asChild`. Dialog, DropdownMenu, Select, Tabs, and Tooltip use Radix primitives; those subpaths require React 18+ and the optional `radix-ui` 1.6+ peer. Toast exports Sonner's `toast` API and a `ToastHost`; mount the host once in the application root and provide Sonner 2+. Native controls, tokens, and CSS assets do not require these runtimes.

The Board keeps its existing import paths as thin re-exports while migrating to these public package contracts. Dialog, menu, tooltip, and tab adapters preserve their existing Radix keyboard/focus contracts. Toast remains on Sonner so existing promise, success, and error notifications keep their current behavior.

## Composition primitives

Composition components are imported individually from `@moonwitness/ui/components/*`. `Field` connects label, description, validation message, and a native control with `aria-describedby`/`aria-invalid`. `EmptyState`, `PageHeader`, `Panel`, and `Toolbar` accept consumer-owned React content. `Skeleton` is decorative by default and honors reduced motion. `Pagination` is controlled and contains no request logic. `Table` and its caption/head/body/row/header/cell exports provide semantic HTML plus a horizontally scrollable wrapper. No composition primitive knows about Board routes, models, filters, loading requests, or permissions.

## Public API and compatibility

Component and icon subpaths are the supported JavaScript contract; internal files and `dist` paths are private. CSS is explicitly exported, scoped under `.mw-ui-*`, and placed in the `components` cascade layer so consumer utility classes can override defaults. Stable releases follow SemVer; changes to exports, required props, accessibility behavior, token meanings, or peer minimums are major changes. Optional Radix/Sonner peers are needed only by the subpaths that use them. Package changes must update direct-export contracts and pass a packed-tarball consumer smoke check.
