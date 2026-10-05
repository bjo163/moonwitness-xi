import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { evaluateScanResult, extractSarifFindings } from './security-scan-policy.mjs';

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

const files = process.argv.slice(2);
let outcomes;
try {
  outcomes = JSON.parse(process.env.TRIVY_SCAN_OUTCOMES ?? '[]');
} catch {
  fail('TRIVY_SCAN_OUTCOMES must be a JSON array.');
  process.exit();
}

if (
  files.length === 0 ||
  !Array.isArray(outcomes) ||
  outcomes.length !== files.length ||
  outcomes.some((outcome) => outcome !== 'success')
) {
  fail('One or more Trivy scanners failed or did not produce a configured report.');
  process.exit();
}

try {
  const findings = [];
  for (const file of files) {
    const sarif = JSON.parse(await readFile(file, 'utf8'));
    findings.push(...extractSarifFindings(sarif));
  }
  const result = evaluateScanResult({ exitCode: 0, findings });
  if (!result.passed) {
    fail(
      `Blocked by ${result.blockingFindings.length} CRITICAL vulnerability finding(s): ${result.blockingFindings
        .map((finding) => finding.id)
        .join(', ')}`
    );
  } else {
    process.stdout.write(
      `Trivy reports valid; ${findings.length} finding(s) reviewed and no CRITICAL vulnerabilities found.\n`
    );
  }
} catch (error) {
  fail(`Trivy SARIF validation failed: ${error.message}`);
}
