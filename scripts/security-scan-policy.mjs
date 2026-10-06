const blockingSeverity = 'CRITICAL';
export const vulnerabilityScanTargets = ['workspace', 'api-image', 'board-image'];

export function evaluateScanResult({ exitCode, findings, scannerError = null, exceptions = [] }) {
  if (scannerError) {
    return { passed: false, reason: 'scanner-error', blockingFindings: [] };
  }

  const blockingFindings = findings.filter(
    (finding) =>
      finding.severity === blockingSeverity &&
      !exceptions.some(
        (exception) => exception.id === finding.id && exception.target === finding.target
      )
  );
  if (exitCode !== 0 || blockingFindings.length > 0) {
    return { passed: false, reason: 'blocking-findings', blockingFindings };
  }

  return { passed: true, reason: 'clean', blockingFindings: [] };
}

export function extractSarifFindings(sarif, target) {
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
      findings.push({
        id: result.ruleId,
        severity: severityByRule.get(result.ruleId),
        ...(target ? { target } : {}),
      });
    }
  }
  return findings;
}

export function isExceptionActive(exception, today) {
  return isValidIsoDate(exception?.expiresOn) && exception.expiresOn >= today;
}

export function validateExceptions(exceptions, today) {
  if (!Array.isArray(exceptions)) return ['exceptions must be an array'];
  const errors = [];
  const identities = new Set();
  for (const [index, exception] of exceptions.entries()) {
    const identity =
      typeof exception?.id === 'string' && exception.id.length > 0
        ? exception.id
        : String(index + 1);
    if (
      typeof exception?.id !== 'string' ||
      exception.id.trim().length === 0 ||
      typeof exception?.owner !== 'string' ||
      exception.owner.trim().length === 0 ||
      typeof exception?.reason !== 'string' ||
      exception.reason.trim().length === 0
    ) {
      errors.push(`exception ${identity} requires id, owner, and reason`);
    }
    if (typeof exception?.id === 'string' && !/^[A-Za-z0-9._:-]{1,80}$/u.test(exception.id)) {
      errors.push(`exception ${identity} requires an exact SARIF rule ID`);
    }
    if (
      typeof exception?.id === 'string' &&
      exception.id.trim().length > 0 &&
      (typeof exception.target !== 'string' || !vulnerabilityScanTargets.includes(exception.target))
    ) {
      errors.push(
        `exception ${identity} requires a target from ${vulnerabilityScanTargets.join(', ')}`
      );
    }
    if (typeof exception?.id === 'string' && typeof exception?.target === 'string') {
      const key = `${exception.target}:${exception.id}`;
      if (identities.has(key)) errors.push(`exception ${identity} duplicates ${key}`);
      identities.add(key);
    }
    if (!isValidIsoDate(exception?.expiresOn)) {
      errors.push(`exception ${identity} requires a real ISO calendar expiry date`);
    } else if (exception.expiresOn < today) {
      errors.push(`exception ${identity} expired on ${exception.expiresOn}`);
    }
  }
  return errors;
}

function isValidIsoDate(value) {
  if (typeof value !== 'string') return false;
  const match = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u.exec(value);
  if (!match?.groups) return false;
  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (daysInMonth[month - 1] ?? 0);
}
