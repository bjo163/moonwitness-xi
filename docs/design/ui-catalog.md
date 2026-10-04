# MoonWitness UI component catalog

The catalog is an interactive consumer of the public
[`@moonwitness/ui`](../../packages/ui/README.md) API. It demonstrates all 21
public component modules, representative typed icons, theme tokens, long labels,
form errors, empty/loading/error states, and the real Radix keyboard flows.
Examples use fabricated data and do not contact the API or require credentials.

## Run and build

```sh
pnpm --filter @moonwitness/ui-catalog dev
pnpm --filter @moonwitness/ui-catalog build
pnpm --filter @moonwitness/ui-catalog test
```

The static preview base defaults to `/moonwitness-xi/components/`, matching the
repository-name subpath used by GitHub Pages. Override it with
`MW_UI_CATALOG_BASE_PATH` when testing another mount path. Browser tests serve
the built output at that nested path and check responsive layout, theme
switching, filtering, fragment navigation, tabs, and dialog keyboard/focus
behavior.

The build output is `apps/ui-catalog/dist`. The catalog has not been published:
the docs portal integration is M6.06 and the GitHub Pages artifact/settings are
M6.07. See [ADR 0002](../decisions/0002-ui-catalog.md) for the framework choice.
