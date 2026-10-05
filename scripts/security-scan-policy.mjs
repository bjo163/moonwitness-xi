const blockingSeverity = 'CRITICAL';

export function evaluateScanResult({ exitCode, findings, scannerError = null }) {
  if (scannerError) {
    return { passed: false, reason: 'scanner-error', blockingFindings: [] };
  }

  const blockingFindings = findings.filter((finding) => finding.severity === blockingSeverity);
  if (exitCode !== 0 || blockingFindings.length > 0) {
    return { passed: false, reason: 'blocking-findings', blockingFindings };
  }

  return { passed: true, reason: 'clean', blockingFindings: [] };
}

export function extractSarifFindings(sarif) {
  if (!sarif || !Array.isArray(sarif.runs) || sarif.runs.length === 0) {
    throw new Error('SARIF must contain at least one run');
  }

  const findings = [];
  for (const run of sarif.runs) {
    const rules = run?.tool?.driver?.rules;
    const results = run?.results;
    if (!Array.isArray(rules) || !Array.isArray(results)) {
      throw new Error('SARIF run must contain driver rules and results arrays');
    }

    const severityByRule = new Map(
      rules
        .filter((rule) => typeof rule?.id === 'string')
        .map((rule) => [
          rule.id,
          Array.isArray(rule?.properties?.tags)
            ? (rule.properties.tags.find((tag) =>
                ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].includes(tag)
              ) ?? 'UNKNOWN')
            : 'UNKNOWN',
        ])
    );

    for (const result of results) {
      if (typeof result?.ruleId !== 'string' || !severityByRule.has(result.ruleId)) {
        throw new Error('SARIF result references a missing vulnerability rule');
      }
      findings.push({ id: result.ruleId, severity: severityByRule.get(result.ruleId) });
    }
  }
  return findings;
}

export function isExceptionActive(exception, today) {
  return /^\d{4}-\d{2}-\d{2}$/.test(exception.expiresOn) && exception.expiresOn >= today;
}

export function validateExceptions(exceptions, today) {
  const errors = [];
  for (const [index, exception] of exceptions.entries()) {
    if (!exception.id || !exception.owner || !exception.reason) {
      errors.push(`exception ${exception.id || index + 1} requires id, owner, and reason`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exception.expiresOn ?? '')) {
      errors.push(`exception ${exception.id || index + 1} requires an ISO expiry date`);
    } else if (!isExceptionActive(exception, today)) {
      errors.push(`exception ${exception.id || index + 1} expired on ${exception.expiresOn}`);
    }
  }
  return errors;
}
