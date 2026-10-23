# MoonWitness UI Bible

This document is the single shared UI rulebook for MoonWitness. `TOKENS.md` is its technical companion for token values, theme mapping, and contrast. Product copy and feature truth stay with each app; this package owns reusable presentation and interaction behavior.

## Visual direction

The MoonWitness identity pairs an ink-dark editorial canvas with bright magenta, signal blue, and high-visibility yellow. Homepage references 1–2 guide expressive typography, irregular collage composition, tactile paper/halftone texture, and clear calls to action. Board references 3–4 guide compact panels, crisp section hierarchy, neon signal accents, and dense information layout. They do not define new product features.

The existing crescent and wordmark in `@moonwitness/assets` remain the brand source. Use its SVG light, dark, monochrome, symbol, and lockup variants. UI icons come from the canonical SVG files in the same package; `scripts/generate-icons.mjs` creates the typed React wrappers. Do not redraw either source in an app. Use optimized raster artwork for complex scenes, but never rasterize labels, navigation, or important state.

Keep readable hierarchy ahead of texture. Text, focus, borders, and state labels must meet the contrast and keyboard rules in `TOKENS.md`. Decorations cannot block input or carry meaning by color, animation, or sound alone.

## Component layers

Build upward only when reuse calls for it:

1. **Foundation** — semantic color, type, spacing, shape, layer, shadow, and motion tokens in `styles/tokens.css`.
2. **Primitive** — one accessible behavior such as `Button`, `Input`, `Checkbox`, `SelectField`, `Textarea`, `Badge`, `Avatar`, and `Skeleton`.
3. **Composition** — arrangements such as `Field`, `Panel`, `Toolbar`, `Table`, `Pagination`, `PageHeader`, `Dialog`, and `EmptyState`.
4. **Pattern/effect** — reusable editorial texture, accent marker, signal orbit, loading progress, and sound preference/playback behavior.

Use the nearest existing public component. Add a component when at least two product surfaces can use it, or when a single surface needs a meaningful accessibility/behavior primitive that cannot be safely duplicated. Put app-specific navigation, data, auth, routes, and domain flows in the app. Avoid wrappers that only rename an element or folders created to satisfy an “atomic” label.

## Import and contribution rules

Import components and icons only through exported public subpaths, for example `@moonwitness/ui/components/button`, `@moonwitness/ui/components/table`, or `@moonwitness/ui/icons/search`. Never import `packages/ui/dist` or another internal path. CSS is imported once by the app: tokens first, then component styles.

When adding a shared component:

1. Confirm its behavior and accessibility contract, then document the public props.
2. Implement it in `src/components/` with tokens and existing shared helpers.
3. Add a public export in `package.json`; do not add a giant all-components barrel.
4. Add or update the package-level behavior/contrast checks for the contract.
5. Use it from Board/homepage and run `pnpm board:ui:check`.

Board source must not use raw JSX `<button>`, `<input>`, `<select>`, or `<textarea>`. Use shared controls, including `Checkbox` for checkboxes and `Input` for file controls. The AST gate ignores text, comments, and capitalized component names. It also rejects internal `dist` imports. Run it manually with `pnpm board:ui:check`; the same command runs before push and in quality CI. Errors include the source line, shared replacement, and recheck command.

Tables preserve native table semantics. Use the shared table composition for tabular data and keep keyboard/sort behavior, mobile visibility, and horizontal overflow explicit. Form controls preserve labels, `disabled`, focus, validation, controlled values, exact textarea whitespace, and selection state.

## Motion and effects

Prefer CSS/SVG and tokenized transitions. Keep animation short and purposeful; honor `prefers-reduced-motion` in both CSS and JavaScript. Stop or avoid continuous work when an effect is off-screen. Load heavy visuals only where used. Do not add canvas/WebGL without a measured need and an explicit performance budget.

Loading UI belongs only to a real pending request or operation. Use skeletons for known content shape and a labeled progress indicator for an active operation. Empty, error, success, and loading states always include visible text; effects only reinforce them. Do not animate indefinitely after work finishes.

## Sound

Use `SoundProvider`, `useSfx`, and `SoundToggle` from `components/audio`; never load audio files from individual Board components. The provider activates playback only after the first pointer or keyboard interaction, honors the locally saved mute choice, and creates audio lazily on use. The package asset catalog is limited to named short cues. Use sound only for selected success, important alert, or explicit media actions—never hover, scrolling, or every ordinary click. Text and visual status remain complete if audio is muted, blocked, or missing.

Audio is optional enhancement. A playback failure must never prevent the related action. Keep cues quiet and short, and add provenance/license information in the assets package manifest whenever a file changes.

## Product boundary

`@moonwitness/ui` owns visual tokens, reusable components, accessibility mechanics, motion/effect primitives, icon wrappers, and sound controls. `@moonwitness/assets` owns the canonical SVG/media files, artwork, font provenance, licenses, and asset manifest. Neither package owns Board routes, authorization, API calls, persistence of product data, analytics meaning, or workflow rules.

See [`TOKENS.md`](./TOKENS.md) for theme and contrast constraints.
