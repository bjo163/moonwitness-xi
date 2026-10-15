import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { URL } from 'node:url';
import {
  evaluateScanResult,
  extractSarifFindings,
  validateExceptions,
  vulnerabilityScanTargets,
} from './security-scan-policy.mjs';

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function annotateCriticalFindings(findings) {
  const ids = [
    ...new Set(
      findings.map((finding) => {
        const safeId = /^[A-Za-z0-9._:-]{1,80}$/u.test(finding.id);
        const safeTarget = vulnerabilityScanTargets.includes(finding.target);
        return safeId && safeTarget ? `${finding.target}:${finding.id}` : 'unrecognized-id';
      })
    ),
  ];
  const visibleIds = ids.slice(0, 10);
  const remaining = ids.length - visibleIds.length;
  const summary = visibleIds.length > 0 ? visibleIds.join(', ') : 'no finding IDs available';
  const suffix = remaining > 0 ? `, and ${remaining} more` : '';
  process.stdout.write(`::error title=Trivy CRITICAL findings::${summary}${suffix}\n`);
}

const files = process.argv.slice(2);
if (files.length !== vulnerabilityScanTargets.length) {
  fail(`Expected one SARIF report for each target: ${vulnerabilityScanTargets.join(', ')}.`);
  process.exit();
}

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
  const policy = JSON.parse(
    await readFile(new URL('../docs/security/vulnerability-policy.json', import.meta.url), 'utf8')
  );
  const policyErrors = validateExceptions(
    policy?.exceptions,
    new Date().toISOString().slice(0, 10)
  );
  if (policy?.blockingSeverity !== 'CRITICAL' || policy?.ignoreUnfixed !== true) {
    policyErrors.push('severity policy must block CRITICAL and may only ignore unfixed advisories');
  }
  if (policyErrors.length > 0) {
    fail(`Vulnerability policy invalid: ${policyErrors.join('; ')}`);
    process.exit();
  }

  const findings = [];
  for (const [index, file] of files.entries()) {
    const sarif = JSON.parse(await readFile(file, 'utf8'));
    findings.push(...extractSarifFindings(sarif, vulnerabilityScanTargets[index]));
  }
  const result = evaluateScanResult({ exitCode: 0, findings, exceptions: policy.exceptions });
  if (!result.passed) {
    annotateCriticalFindings(result.blockingFindings);
    fail(
      `Blocked by ${result.blockingFindings.length} CRITICAL vulnerability finding(s); see the workflow annotation for safe finding IDs.`
    );
  } else {
    process.stdout.write(
      `Trivy reports valid; ${findings.length} finding(s) reviewed and no unexcepted CRITICAL vulnerabilities found.\n`
    );
  }
} catch {
  fail(
    'Trivy SARIF validation failed; inspect the scanner artifact in the authorized workflow context.'
  );
}
