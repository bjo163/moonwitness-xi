# ADR 0001: Platform delivery contracts

- Status: accepted as roadmap contract; implementation is in progress.
- Date: 2026-10-04.
- Context: project already uses a monorepo, programmatic ORM addon install, main branch, GitHub CI/releases, and the user requested two branches with automated Issues/docs/releases but no app deployment.

## Decisions

1. Repository branch names are exactly main and dev. Dev integrates work; main receives promoted, checked changes. Do not create feature, dependency, release, hotfix or gh-pages branches.
2. Promotion is PR dev→main. CI must exist and required check names must pass before rulesets/auto-merge are activated. Main isn't updated directly during routine task delivery.
3. Completed logical work is verified, committed with task ID, pushed normally to dev, and checked against its remote SHA. No-op has no empty commit. Push is not the same as merge or release.
4. Main promotion triggers stable release processing from verified SHA. Version bump is computed once per substantive batch since the last release; issue/status/docs-only writes don't bump product version.
5. GitHub Issues are a projection of stable roadmap task IDs and acceptance. Git owns task scope/acceptance; evidence owns completion; GitHub owns discussion/assignees/triage. Never overwrite free-form maintainer notes.
6. Auto-merge may act only after required checks and configured risk/review gates; it never bypasses them. Breaking/destructive/security-policy changes require explicit review. Keep dev after merge.
7. Schema and reference seeds remain programmatic addon installation; don't introduce traditional SQL migration scripts. Upgrades preserve existing user data; destructive correction requires a separately reviewed programmatic strategy and recovery evidence.
8. Package additions require responsibility boundaries and real consumers. Assets are framework-independent; React UI wrappers are in ui; charts stay separate only if measured reuse warrants it.
9. GitHub Releases, GHCR artifacts and GitHub Pages are in scope; deploying the running application to staging or production is out of scope.
10. Public demo/docs data must be synthetic, labeled and non-delivering. Audit/action records must represent real events; never fake audit history.

## Consequences

- Standard dependency bots that create branches need a dev-only candidate updater or a documented alternative.
- GitHub auto-merge is optional repository configuration and still depends on required checks/review eligibility.
- Rulesets/Pages/App credentials may require one-time settings and account capabilities; report actual activation separately from repository code.
- A release can be published while Pages is temporarily incomplete only if the state is reported and recoverable; the end-to-end milestone isn't done until reconciled.
- First stable release from the existing 1.0.0-rc.1 tag requires explicit classification/decision; automation must not guess.

## Review triggers

Revisit this ADR if GitHub cannot enforce exactly two branch names, if maintainers need parallel feature branches, if independent package releases become necessary, or if a user authorizes application deployment. Record an amended ADR rather than silently changing the contract.
