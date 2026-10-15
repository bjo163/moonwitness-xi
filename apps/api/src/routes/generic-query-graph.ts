import type { JsonValue } from '@moonwitness/types';

const USER_RELATIONS: Readonly<Record<string, ReadonlySet<string>>> = {
  'base.partner': new Set(['company', 'country', 'addresses.country', 'category_links.category']),
  'base.partner_address': new Set(['country']),
  'base.partner_category_link': new Set(['category']),
  'base.company': new Set(['country', 'currency', 'language']),
  'base.tag_link': new Set(['tag']),
  'base.activity': new Set(['assigned_to']),
};

export function userGraphAllowed(
  role: string | undefined,
  modelName: string,
  graph: string | undefined
): boolean {
  if (role !== 'user' || graph === undefined) return true;
  const value = graph.trim();
  if (!value) return true;
  const startsWithBracket = value.startsWith('[');
  const endsWithBracket = value.endsWith(']');
  if (startsWithBracket !== endsWithBracket) return false;
  const paths = (startsWithBracket ? value.slice(1, -1) : value)
    .split(',')
    .map((path) => path.trim());
  const allowed = USER_RELATIONS[modelName];
  return paths.length > 0 && paths.every((path) => path.length > 0 && allowed?.has(path) === true);
}

/** Accept comma-separated top-level relations and convert them to Objection's graph syntax. */
export function relationExpression(graph: string | undefined): string | undefined {
  const value = graph?.trim();
  if (!value || !value.includes(',') || value.startsWith('[')) return value;
  return `[${value}]`;
}

export function queryGraphIsBounded(graph: string | undefined): boolean {
  if (!graph) return true;
  if (graph.length > 512) return false;
  const paths =
    graph.startsWith('[') && graph.endsWith(']') ? graph.slice(1, -1).split(',') : [graph];
  return paths.every((path) => {
    const segments = path.trim().split('.');
    return segments.length > 0 && segments.length <= 3 && segments.every(Boolean);
  });
}

export function rpcSearchReadIsBounded(kwargs: Record<string, JsonValue>): boolean {
  const fields = kwargs.fields;
  if (Array.isArray(fields) && fields.length > 100) return false;
  const graph = typeof kwargs.with === 'string' ? kwargs.with : undefined;
  const order = typeof kwargs.order === 'string' ? kwargs.order : undefined;
  return queryGraphIsBounded(graph) && (order?.length ?? 0) <= 512;
}
