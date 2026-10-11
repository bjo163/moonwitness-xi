const githubIssueUrlPattern = /^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+$/u;

export function validateFlakyPolicy(policy, today = new Date().toISOString().slice(0, 10)) {
  const errors = [];
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return ['Policy must be an object.'];
  }
  if (policy.version !== 1) errors.push('Policy version must be 1.');
  if (!Number.isInteger(policy.maxRetries) || policy.maxRetries < 0 || policy.maxRetries > 1) {
    errors.push('maxRetries must be an integer between 0 and 1.');
  }
  if (!Array.isArray(policy.quarantine)) errors.push('quarantine must be an array.');
  if (!Array.isArray(policy.protectedTestPatterns)) {
    errors.push('protectedTestPatterns must be an array.');
  }
  if (!Array.isArray(policy.quarantine) || !Array.isArray(policy.protectedTestPatterns)) {
    return errors;
  }

  const seenIds = new Set();
  for (const [index, entry] of policy.quarantine.entries()) {
    const prefix = `quarantine[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`${prefix} must be an object.`);
      continue;
    }
    if (typeof entry.id !== 'string' || entry.id.trim() === '' || seenIds.has(entry.id)) {
      errors.push(`${prefix}.id must be a unique non-empty string.`);
    } else {
      seenIds.add(entry.id);
    }
    if (typeof entry.test !== 'string' || entry.test.trim() === '') {
      errors.push(`${prefix}.test must be a non-empty test identifier.`);
    } else {
      for (const pattern of policy.protectedTestPatterns) {
        if (typeof pattern === 'string' && new RegExp(pattern, 'iu').test(entry.test)) {
          errors.push(
            `${prefix}.test matches protected pattern '${pattern}' and cannot be quarantined.`
          );
          break;
        }
      }
    }
    if (typeof entry.owner !== 'string' || !/^@[a-zd-]+$/iu.test(entry.owner)) {
      errors.push(`${prefix}.owner must be a GitHub username prefixed with @.`);
    }
    if (typeof entry.issue !== 'string' || !githubIssueUrlPattern.test(entry.issue)) {
      errors.push(`${prefix}.issue must link to a GitHub issue.`);
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim() === '') {
      errors.push(`${prefix}.reason must explain the quarantine.`);
    }
    if (
      typeof entry.expiresOn !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/u.test(entry.expiresOn) ||
      Number.isNaN(Date.parse(`${entry.expiresOn}T00:00:00Z`)) ||
      new Date(`${entry.expiresOn}T00:00:00Z`).toISOString().slice(0, 10) !== entry.expiresOn
    ) {
      errors.push(`${prefix}.expiresOn must be a valid YYYY-MM-DD date.`);
    } else if (entry.expiresOn < today) {
      errors.push(`${prefix} expired on ${entry.expiresOn}.`);
    }
  }

  return errors;
}
