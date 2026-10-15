function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/** Render a minimal JUnit failure that identifies only the unit runner phase. */
export function renderUnitRunnerFailureReport(phase, exitCode, buildFailure = undefined) {
  if (phase.trim().length === 0) throw new Error('A unit runner phase name is required.');
  if (!Number.isInteger(exitCode) || exitCode === 0)
    throw new Error('A unit runner failure requires a non-zero exit code.');

  const safePhase = escapeXml(phase);
  const failureDetails =
    phase === 'Build' && buildFailure
      ? {
          packageName:
            typeof buildFailure.failedPackage === 'string' &&
            /^@moonwitness\/[a-z0-9-]+$/u.test(buildFailure.failedPackage)
              ? buildFailure.failedPackage
              : 'unknown package',
          diagnostics: Array.isArray(buildFailure.diagnostics)
            ? buildFailure.diagnostics.filter(
                (item) =>
                  item &&
                  typeof item.path === 'string' &&
                  /^(?:apps|packages)\/[a-z0-9-]+\/[a-z0-9_./-]+$/u.test(item.path) &&
                  Number.isSafeInteger(item.line) &&
                  item.line > 0 &&
                  Number.isSafeInteger(item.column) &&
                  item.column > 0 &&
                  typeof item.code === 'string' &&
                  /^TS\d+$/u.test(item.code)
              )
            : [],
        }
      : undefined;
  const failureLabel = failureDetails
    ? `${failureDetails.packageName}; ${
        failureDetails.diagnostics
          .map((item) => `${item.path}(${item.line},${item.column}) ${item.code}`)
          .join('; ') || 'no TypeScript location captured'
      }`
    : 'Test execution stopped before a suite report was written.';
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<testsuites tests="1" failures="1" errors="0" skipped="0" time="0">',
    '  <testsuite name="unit runner" tests="1" failures="1" errors="0" skipped="0" time="0">',
    `    <testcase classname="unit-runner" name="${safePhase} exited ${exitCode}" time="0">`,
    `      <failure message="Runner phase failed with exit code ${exitCode}">${escapeXml(failureLabel)}</failure>`,
    '    </testcase>',
    '  </testsuite>',
    '</testsuites>',
    '',
  ].join('\n');
}
