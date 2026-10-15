# MoonWitness design tokens

`@moonwitness/ui/styles/tokens.css` is the source of truth for shared visual values. Import it once, then map its `--mw-*` variables into framework utilities or component styles. Do not copy literal palette values into app-specific theme files.

## Semantic colors

Use `background`/`foreground` for the page, `surface`/`surface-foreground` for raised panels, `muted`/`muted-foreground` for secondary surfaces, and `border`, `input`, and `focus` for controls. `primary`, `accent`, and `destructive` include matching foreground tokens. Success, warning, and info each have a paired `on-*` foreground. Preserve these meanings when switching `.dark`; status must never change meaning with the theme.

The package test calculates WCAG relative luminance and contrast from the source hex values. Normal text pairs must be at least 4.5:1. The pink accent requires `--mw-on-pink` (dark ink); white on the brand pink is only 3.50:1 and fails normal-text AA. Dark-theme page, raised-surface, and muted text pairs are checked against their mapped dark surfaces as well. For focus and non-text control boundaries, target at least 3:1 against adjacent colors.

## Type and layout

Display, sans, and monospace stacks have system fallbacks and do not load remote fonts. A consuming site owns font licensing, self-hosting, and fallback verification. Use the provided font-size, line-height, spacing, radius, hard-shadow, and motion scales rather than introducing a parallel scale.

The token stylesheet intentionally has no global element selectors, CSS framework dependency, font request, or application side effect. Theme selection remains owned by the consuming app through the `.dark` class and its persisted preference.

## Charts and status

Chart colors are stable across themes to preserve series identity, but a chart must also provide labels, markers, line patterns, or an accessible data table. Never make status or series interpretation depend on color alone. Chart series colors have not been certified as text colors; place labels on their own semantic surface using its paired foreground token.

## Reduced motion

The package reduces its motion duration tokens to zero under `prefers-reduced-motion`. Components must consume those tokens and keep meaningful state changes available without animation. App-specific motion that does not use these variables must also honor the media preference.
