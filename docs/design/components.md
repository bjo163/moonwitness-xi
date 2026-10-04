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
