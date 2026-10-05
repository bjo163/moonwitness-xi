# Release artifact flow

The release workflow has a verify phase and a separately dispatched publish phase. A version tag is eligible only when it points to a commit reachable from `main` and the exact SHA has a successful `ci-gate` from a `main` push. The release verify job then runs the release checks, full quality/integration suite, Board/API container smoke checks, and a blocking CRITICAL vulnerability scan.

For tag runs, the verify job builds the API and Board images once. It labels each image with the source SHA and release version, smoke-tests those local images, and stores their image IDs in a manifest beside the archive. The workflow artifact includes checksums for the archive and manifest, plus a GitHub artifact digest in the verify run summary. The publish job downloads that artifact, verifies the checksums, source/version, image IDs and image labels, then pushes the loaded images. It must not rebuild either image.

Prerelease tags such as `v1.2.0-rc.1` publish versioned images but do not move the `latest` image tags. For stable versions, the publish job compares the candidate against all published stable GitHub Release tags and advances `latest` only when the candidate is strictly newer. Replaying an equal or older version leaves `latest` unchanged. Release publication creates container images and a GitHub Release; it does not deploy the API or Board application.

Publishing a versioned image first checks the existing GHCR tag. A retry reuses it only when the image ID, source SHA, version label, and OCI digest match; a conflicting tag fails without overwriting it. The publisher treats only a registry `manifest unknown` response as a missing tag; auth/network failures stop before writes. It also confirms the remote Git tag still points to the SHA whose artifacts passed verification.

The image artifact is retained for 30 days and belongs to the workflow run that verified its source. If it expires before a publish dispatch, rerun verification for the same trusted tag. Do not substitute an artifact from another workflow run or SHA.

## Current release automation limits

The image tag retry path now reconciles matching images without writing and refuses conflicting content. The wider release lifecycle is still being hardened: cross-image partial publication, release asset reconciliation, and checksums/SBOM/provenance for every published asset are not yet complete, and no hosted full release cycle has been verified. Those roadmap items remain open; do not treat local workflow tests as proof of a published release.
