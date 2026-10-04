# `@moonwitness/assets`

Framework-independent SVG assets for MoonWitness. The package has no runtime dependencies; React icon wrappers belong in `@moonwitness/ui`.

## Generate and export

The published package contains the generated assets, manifest, license provenance, and usage documentation. In the MoonWitness repository, maintainers can run `pnpm assets:generate` to regenerate the SVG files and manifest from the deterministic generator, `pnpm assets:render` to render social and icon proofs with repository Playwright Chromium, and `pnpm assets:validate` to check the whole SVG export set before packaging.

Consumers can import a static asset through a package export, for example:

```text
@moonwitness/assets/brand/moonwitness-lockup-dark.svg
@moonwitness/assets/brand/favicon.svg
@moonwitness/assets/icons/partner.svg
@moonwitness/assets/illustrations/empty-light.svg
@moonwitness/assets/manifest.json
@moonwitness/assets/licenses.json
```

The icon inventory uses 24×24 SVG viewBoxes, a 1.8-unit rounded stroke, and `currentColor` for inline/themeable consumers. For standalone `<img>` usage the SVG uses the browser's default current color; use the React wrappers in `@moonwitness/ui` when it is necessary to inherit an element color. The visual scale/theme contact sheet is at `docs/design/assets/icon-contact-sheet.png` in the repository.

Illustration exports cover empty, no-results, no-activity, access-denied, not-found, offline, onboarding, and an orbit pattern in light and dark variants. Keep user-facing instructions and actions as real text and controls; do not rely on the illustration alone to communicate a state.

Variant suffixes describe the intended foreground palette and assume a transparent background unless the SVG is a banner/card/icon with its own surface. `mono-light` is dark ink for light surfaces; `mono-dark` is paper ink for dark surfaces. Use a lockup when there is enough room, and the symbol/favicon for compact spaces. Do not recolor by string replacement; generate from the shared palette definitions.

SVG sources use built-in geometric paths and system font fallbacks only. They have no external image/font references. Creator, source, modifications, and licenses are recorded in [`licenses.json`](./licenses.json); font binaries are not included in this package.
