# Flaky test policy

CI retries a browser test at most once. The Playwright retry diagnostics report keeps the first attempt's status and concise error alongside the retry result, even if the retry passes. CI scans that JSON with the other reports before uploading it.

Tests are never quarantined by default. A quarantine entry is currently tracking metadata only: it does not skip or remove a test from CI, so every test remains blocking. To track a reproducibly flaky non-critical test, add one entry to [`flaky-tests.json`](flaky-tests.json) with its stable ID, test identifier, responsible GitHub username, tracking issue URL, reason, and `expiresOn` date. The automation check fails if any required field is absent, an expiry date has passed, IDs repeat, or a protected authentication/authorization/security test is listed. Remove the entry as soon as the issue is fixed; an expiry is a deadline, not an automatic extension.

Do not add a quarantine based only on one failed run. Compare the first attempt, retry diagnostics, and more than one CI run to identify the cause. Do not increase retries to turn a failure green; a persistent second failure stays red and blocks the gate.
