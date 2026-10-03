import type { Domain, DomainTerm } from './types.js';

export function evalTerm(term: DomainTerm, record: Record<string, unknown>): boolean {
  const [field, op, expected] = term;
  const actual = record[field];

  switch (op) {
    case '=':
      return actual === expected;
    case '!=':
      return actual !== expected;
    case '>':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case '<':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case '>=':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    case '<=':
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
    case 'in':
      return Array.isArray(expected) && expected.includes(actual);
    case 'not in':
      return Array.isArray(expected) && !expected.includes(actual);
    case 'ilike':
      return String(actual ?? '')
        .toLowerCase()
        .includes(String(expected ?? '').toLowerCase());
    case 'not ilike':
      return !String(actual ?? '')
        .toLowerCase()
        .includes(String(expected ?? '').toLowerCase());
    default:
      return actual == expected;
  }
}

/**
 * Evaluates a prefix (Polish notation) domain array against an in-memory record.
 * Terms are ANDed by default.
 * Example: `['|', ['active', '=', true], ['name', '=', 'admin']]`
 */
export function evalDomain(
  domain: Domain | boolean | undefined,
  record: Record<string, unknown>
): boolean {
  if (domain === undefined || domain === null) return false;
  if (typeof domain === 'boolean') return domain;
  if (!Array.isArray(domain) || domain.length === 0) return true;

  const stack: boolean[] = [];
  for (let i = domain.length - 1; i >= 0; i--) {
    const item = domain[i];
    if (item === '&') {
      const a = stack.pop() ?? true;
      const b = stack.pop() ?? true;
      stack.push(a && b);
    } else if (item === '|') {
      const a = stack.pop() ?? false;
      const b = stack.pop() ?? false;
      stack.push(a || b);
    } else if (item === '!') {
      const a = stack.pop() ?? true;
      stack.push(!a);
    } else if (Array.isArray(item)) {
      stack.push(evalTerm(item as DomainTerm, record));
    }
  }

  return stack.reduce((acc, val) => acc && val, true);
}
