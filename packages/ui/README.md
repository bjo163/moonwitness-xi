# `@moonwitness/ui`

Shared, framework-independent MoonWitness design tokens. This package has no runtime or application dependencies. React is an optional peer reserved for the typed component exports added by later design-system milestones.

## Stylesheet

Import the public token entry once, before component styles:

```css
@import '@moonwitness/ui/styles/tokens.css';
```

The stylesheet defines semantic custom properties on `:root` and switches their light/dark surface mappings under `.dark`. It does not set global element styles, load fonts over the network, or require Tailwind. Applications may map these variables to their styling framework without copying the token values.

See [the token guide](./TOKENS.md) for semantic rules, measured contrast, motion, and chart color use.
