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

The initial primitive set also exports native `Checkbox` and `SelectField` controls, a `Badge`, and a named `Avatar`. Native form controls keep browser keyboard, label, and submission behavior. `Button` preserves `button` semantics and supports Radix `Slot` composition with `asChild`; install React 18+ and `radix-ui` when using that composition option. Consumers that do not use `asChild` or React icon components do not need Radix at runtime.

The Board keeps its existing import paths as thin re-exports while migrating to these public package contracts. Dialog, menu, tooltip, toast, and tab wrappers remain separate work under M5.09 and must retain their existing keyboard/focus behavior when moved.
