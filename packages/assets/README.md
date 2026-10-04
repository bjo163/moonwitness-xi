# `@moonwitness/assets`

Framework-independent SVG assets for MoonWitness. The package has no runtime dependencies; React icon wrappers belong in `@moonwitness/ui`.

## Generate and export

The published package contains the generated assets only. In the MoonWitness repository, maintainers can run `pnpm assets:generate` to regenerate the SVG files and manifest from the deterministic generator, then `pnpm assets:render` to rasterize the social card with the repository's Playwright Chromium setup and refresh the repository-only proof sheet at `docs/design/assets/brand-identity-contact-sheet.png`.

Consumers can import a static asset through a package export, for example:

```text
@moonwitness/assets/brand/moonwitness-lockup-dark.svg
@moonwitness/assets/brand/favicon.svg
@moonwitness/assets/manifest.json
```

Variant suffixes describe the intended foreground palette and assume a transparent background unless the SVG is a banner/card/icon with its own surface. `mono-light` is dark ink for light surfaces; `mono-dark` is paper ink for dark surfaces. Use a lockup when there is enough room, and the symbol/favicon for compact spaces. Do not recolor by string replacement; generate from the shared palette definitions.

SVG sources use built-in geometric paths and system font fallbacks only. They have no external image/font references. Third-party and source provenance is tracked separately under M5.07.
