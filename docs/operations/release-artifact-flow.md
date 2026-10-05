# Release artifact flow

The release workflow has a verify phase and a separately dispatched publish phase. A version tag is eligible only when it points to a commit reachable from `main` and the exact SHA has a successful `ci-gate` from a `main` push. The release verify job then runs the release checks, full quality/integration suite, Board/API container smoke checks, and a blocking CRITICAL vulnerability scan.

For tag runs, the verify job builds the API and Board images once. It labels each image with the source SHA and release version, smoke-tests those local images, and stores their image IDs in a manifest beside the archive. The workflow artifact includes checksums for the archive and manifest, plus a GitHub artifact digest in the verify run summary. The publish job downloads that artifact, verifies the checksums, source/version, image IDs and image labels, then pushes the loaded images. It must not rebuild either image.

Prerelease tags such as `v1.2.0-rc.1` publish versioned images but do not move the `latest` image tags. A stable tag currently advances `latest` only after the complete verify job succeeds. Release publication creates container images and a GitHub Release; it does not deploy the API or Board application.

The image artifact is retained for 30 days and belongs to the workflow run that verified its source. If it expires before a publish dispatch, rerun verification for the same trusted tag. Do not substitute an artifact from another workflow run or SHA.

## Current release automation limits

This build-once handoff proves the same saved images reach the publish job, but the wider release lifecycle is still being hardened. The workflow does not yet reconcile partial publication idempotently, protect `latest` from an older stable release, generate and verify checksums/SBOM/provenance for every published asset, or prove a hosted complete release cycle. Those roadmap items remain open; do not treat local workflow tests as proof of a published release.
