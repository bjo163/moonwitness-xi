# MoonWitness design tokens

The reusable token package owns the palette, semantic light/dark mapping, typography, layout scales, motion policy, and contrast contract. Read the [published token guide](../../packages/ui/TOKENS.md) and [package instructions](../../packages/ui/README.md).

The Board imports `@moonwitness/ui/styles/tokens.css`; its Tailwind theme maps those values without redefining the palette. CI calculates semantic text and control contrast from the actual token source, including the light and dark mappings.
