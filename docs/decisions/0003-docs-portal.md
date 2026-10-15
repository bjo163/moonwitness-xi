# ADR 0003: Static developer documentation portal

- Status: Accepted
- Date: 2026-10-05

## Context

The repository has a framework-neutral guide with generated reference data and a shared UI and
assets package. It needs a branded developer portal that can be built without an application
server, works under the repository's GitHub Pages subpath, and does not pull Board navigation or
business code into the public documentation experience.

## Decision

- Build a small React + Vite static app in `apps/docs`; use the shared `@moonwitness/ui` and
  `@moonwitness/assets` packages for controls, tokens, logo and illustrations.
- Render the generated guide bundle with `react-markdown` and `remark-gfm`. Raw HTML stays disabled;
  heading IDs are generated for local fragments.
- Use React Router's browser history with the Vite base path as its basename. Generate `404.html`
  from the app shell so GitHub Pages can serve the client router for nested URLs.
- Keep search and navigation in the static client. The bundle contains Markdown from the repository,
  has no runtime API or database dependency, and is rebuilt from the selected source before publish.
- Run route, search, keyboard, mobile layout, nested reload and 404 tests in Chromium. Keep external
  URL availability separate from required local docs validation.

## Tradeoffs

A static React app adds JavaScript and a generated artifact compared with plain Markdown. In exchange,
the portal reuses the project's UI/assets, provides searchable client navigation, supports deep links,
and requires no runtime service. GitHub Pages' static routing behavior is handled by the checked
fallback page rather than introducing a server rewrite requirement.

The Markdown renderer supports GitHub-flavored tables and task lists while avoiding raw HTML
execution. The browser bundle is split so the Markdown renderer loads separately from navigation and
search.

## References

- [React Markdown](https://reactmarkdown.com/) renders Markdown as React elements and supports remark plugins.
- [React Router BrowserRouter API](https://api.reactrouter.com/v8/functions/react-router.BrowserRouter.html) provides a `basename` for deployment subpaths.
