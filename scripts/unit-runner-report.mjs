function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/** Render a minimal JUnit failure that identifies only the unit runner phase. */
export function renderUnitRunnerFailureReport(phase, exitCode) {
  if (phase.trim().length === 0) throw new Error('A unit runner phase name is required.');
  if (!Number.isInteger(exitCode) || exitCode === 0)
    throw new Error('A unit runner failure requires a non-zero exit code.');

  const safePhase = escapeXml(phase);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<testsuites tests="1" failures="1" errors="0" skipped="0" time="0">',
    '  <testsuite name="unit runner" tests="1" failures="1" errors="0" skipped="0" time="0">',
    `    <testcase classname="unit-runner" name="${safePhase} exited ${exitCode}" time="0">`,
    `      <failure message="Runner phase failed with exit code ${exitCode}">Test execution stopped before a suite report was written.</failure>`,
    '    </testcase>',
    '  </testsuite>',
    '</testsuites>',
    '',
  ].join('\n');
}
