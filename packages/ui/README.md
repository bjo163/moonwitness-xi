# `@moonwitness/ui`

MoonWitness design tokens and typed, tree-shakeable React icons. The stylesheet has no runtime dependency. Consumers that import icon components must provide React 18 or newer; CSS-only consumers do not need React.

The base control subpaths also require React 18 or newer. Radix-backed controls (`Button`, `Dialog`, `DropdownMenu`, `Select`, `Tabs`, and `Tooltip`) require the optional `radix-ui` 1.6+ peer when imported. Toast exports Sonner's `toast` API and a `ToastHost`; mount the host once in the app root and provide `sonner` 2+. Consumers importing only static tokens/assets do not need either runtime.

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

See [the token guide](./TOKENS.md) for semantic rules, measured contrast, motion, and chart color use.
