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
