import type { JsonValue } from './types.js';
import type { Domain, DomainLeaf, DomainOperator } from './types.js';

export type ASTNode =
  | { type: 'LEAF'; field: string; op: DomainOperator; value: JsonValue }
  | { type: 'AND'; left: ASTNode; right: ASTNode }
  | { type: 'OR'; left: ASTNode; right: ASTNode }
  | { type: 'NOT'; child: ASTNode };

const DOMAIN_OPERATORS = new Set<DomainOperator>([
  '=',
  '!=',
  '<>',
  '>',
  '>=',
  '<',
  '<=',
  'like',
  'ilike',
  'not like',
  'not ilike',
  '=like',
  'in',
  'not in',
  'is null',
  'is not null',
]);
const MAX_DOMAIN_TERMS = 100;
const MAX_DOMAIN_FIELD_LENGTH = 255;
const MAX_DOMAIN_STRING_LENGTH = 4096;
const MAX_DOMAIN_LIST_LENGTH = 500;
const MAX_DOMAIN_NESTING = 32;

function isDomainScalar(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

/** Validates untrusted REST/RPC input before it reaches query construction. */
export function validateDomain(input: unknown, allowedFields?: ReadonlySet<string>): Domain {
  if (!Array.isArray(input) || input.length > MAX_DOMAIN_TERMS) {
    throw new Error(`Invalid domain: expected an array with at most ${MAX_DOMAIN_TERMS} terms`);
  }

  const terms: unknown[] = input;
  for (const [index, item] of terms.entries()) {
    if (item === '&' || item === '|' || item === '!') continue;
    if (!Array.isArray(item) || (item.length !== 2 && item.length !== 3)) {
      throw new Error(`Invalid domain: term ${index} must be a two- or three-item leaf`);
    }
    const leaf: unknown[] = item;
    const [field, rawOperator, value] = leaf;
    if (
      typeof field !== 'string' ||
      field.length === 0 ||
      field.length > MAX_DOMAIN_FIELD_LENGTH ||
      !/^[A-Za-z_][A-Za-z0-9_.]*$/u.test(field)
    ) {
      throw new Error(`Invalid domain: term ${index} has an invalid field`);
    }
    if (allowedFields && !allowedFields.has(field)) {
      throw new Error(`Invalid domain: field '${field}' is not queryable`);
    }

    let operator: DomainOperator = '=';
    let operand = rawOperator;
    if (leaf.length === 3) {
      if (typeof rawOperator !== 'string') {
        throw new Error(`Invalid domain: term ${index} has an invalid operator`);
      }
      operator = rawOperator.toLowerCase() as DomainOperator;
      if (!DOMAIN_OPERATORS.has(operator)) {
        throw new Error(`Invalid domain: operator '${rawOperator}' is not supported`);
      }
      operand = value;
    }

    if (typeof operand === 'string' && operand.length > MAX_DOMAIN_STRING_LENGTH) {
      throw new Error(`Invalid domain: term ${index} value is too long`);
    }
    if (!isDomainScalar(operand)) {
      if (
        !Array.isArray(operand) ||
        operand.length > MAX_DOMAIN_LIST_LENGTH ||
        !operand.every(isDomainScalar)
      ) {
        throw new Error(`Invalid domain: term ${index} must use a scalar or a bounded scalar list`);
      }
    }
    if (
      ['like', 'ilike', 'not like', 'not ilike', '=like'].includes(operator) &&
      typeof operand !== 'string'
    ) {
      throw new Error(`Invalid domain: operator '${operator}' requires a string value`);
    }
    if (Array.isArray(operand) && operator !== 'in' && operator !== 'not in') {
      throw new Error(`Invalid domain: operator '${operator}' does not accept a list`);
    }
  }

  const depths: number[] = [];
  for (const item of [...terms].reverse()) {
    if (item === '&' || item === '|') {
      const left = depths.pop();
      const right = depths.pop();
      if (left === undefined || right === undefined) {
        throw new Error(`Invalid domain: '${item}' operator expects 2 arguments`);
      }
      depths.push(Math.max(left, right) + 1);
    } else if (item === '!') {
      const child = depths.pop();
      if (child === undefined) throw new Error("Invalid domain: '!' operator expects 1 argument");
      depths.push(child + 1);
    } else {
      depths.push(1);
    }
    if ((depths.at(-1) ?? 0) > MAX_DOMAIN_NESTING) {
      throw new Error(`Invalid domain: expression nesting exceeds ${MAX_DOMAIN_NESTING}`);
    }
  }

  return input as Domain;
}

interface DomainQuery {
  where(callback: (query: DomainQuery) => void): DomainQuery;
  where(field: string, operator: string, value: string | number | boolean): DomainQuery;
  orWhere(callback: (query: DomainQuery) => void): DomainQuery;
  whereNot(callback: (query: DomainQuery) => void): DomainQuery;
  whereNull(field: string): DomainQuery;
  whereNotNull(field: string): DomainQuery;
  whereIn(field: string, values: unknown[]): DomainQuery;
  whereNotIn(field: string, values: unknown[]): DomainQuery;
  whereRaw(sql: string, bindings: unknown[]): DomainQuery;
}

/**
 * Normalizes a domain leaf.
 * E.g. ['name', '=', 'Bob'] or ['name', 'Bob'] -> { field: 'name', op: '=', value: 'Bob' }
 */
export function normalizeLeaf(leaf: DomainLeaf): {
  field: string;
  op: DomainOperator;
  value: JsonValue;
} {
  if (leaf.length === 2) {
    return { field: leaf[0], op: '=', value: leaf[1] };
  }
  const [field, rawOp, value] = leaf;
  const op = (rawOp.toLowerCase() as DomainOperator) || '=';
  return { field, op, value };
}

/**
 * Parses a Polish notation domain array into an AST.
 * Supports '&', '|', '!', and leaves.
 * Implicit consecutive leaves are joined with 'AND'.
 */
export function parseDomainToAST(domain: Domain): ASTNode | null {
  domain = validateDomain(domain);
  if (!Array.isArray(domain) || domain.length === 0) {
    return null;
  }

  const stack: ASTNode[] = [];
  const reversed = [...domain].reverse();

  for (const item of reversed) {
    if (item === '&') {
      const left = stack.pop();
      const right = stack.pop();
      if (!left || !right) {
        throw new Error(`Invalid domain: '&' operator expects 2 arguments.`);
      }
      if (Math.max(astDepth(left), astDepth(right)) >= MAX_DOMAIN_NESTING) {
        throw new Error(`Invalid domain: expression nesting exceeds ${MAX_DOMAIN_NESTING}`);
      }
      stack.push({ type: 'AND', left, right });
    } else if (item === '|') {
      const left = stack.pop();
      const right = stack.pop();
      if (!left || !right) {
        throw new Error(`Invalid domain: '|' operator expects 2 arguments.`);
      }
      if (Math.max(astDepth(left), astDepth(right)) >= MAX_DOMAIN_NESTING) {
        throw new Error(`Invalid domain: expression nesting exceeds ${MAX_DOMAIN_NESTING}`);
      }
      stack.push({ type: 'OR', left, right });
    } else if (item === '!') {
      const child = stack.pop();
      if (!child) {
        throw new Error(`Invalid domain: '!' operator expects 1 argument.`);
      }
      if (astDepth(child) >= MAX_DOMAIN_NESTING) {
        throw new Error(`Invalid domain: expression nesting exceeds ${MAX_DOMAIN_NESTING}`);
      }
      stack.push({ type: 'NOT', child });
    } else if (Array.isArray(item)) {
      const { field, op, value } = normalizeLeaf(item as DomainLeaf);
      stack.push({ type: 'LEAF', field, op, value });
    } else {
      throw new Error(`Invalid domain element: ${JSON.stringify(item)}`);
    }
  }

  if (stack.length === 0) {
    return null;
  }

  // Combine remaining items on stack with implicit AND (left-to-right order)
  let root = stack.pop()!;
  while (stack.length > 0) {
    const next = stack.pop()!;
    root = { type: 'AND', left: root, right: next };
  }

  return root;
}

function astDepth(node: ASTNode): number {
  switch (node.type) {
    case 'LEAF':
      return 1;
    case 'NOT':
      return astDepth(node.child) + 1;
    case 'AND':
    case 'OR':
      return Math.max(astDepth(node.left), astDepth(node.right)) + 1;
  }
}

/**
 * Recursively applies an AST node to an Objection/Knex QueryBuilder.
 */
export function applyAstToQuery(qb: DomainQuery, node: ASTNode): void {
  switch (node.type) {
    case 'LEAF':
      applyLeafToQuery(qb, node.field, node.op, node.value);
      break;

    case 'AND':
      qb.where((subQb: DomainQuery) => {
        applyAstToQuery(subQb, node.left);
        applyAstToQuery(subQb, node.right);
      });
      break;

    case 'OR':
      qb.where((subQb: DomainQuery) => {
        subQb
          .where((q1: DomainQuery) => applyAstToQuery(q1, node.left))
          .orWhere((q2: DomainQuery) => applyAstToQuery(q2, node.right));
      });
      break;

    case 'NOT':
      qb.whereNot((subQb: DomainQuery) => {
        applyAstToQuery(subQb, node.child);
      });
      break;
  }
}

/**
 * Applies a single domain leaf to a QueryBuilder.
 */
function applyLeafToQuery(
  qb: DomainQuery,
  field: string,
  op: DomainOperator,
  value: JsonValue
): void {
  const scalar = value as string | number | boolean | null;
  switch (op) {
    case '=':
      if (value === null) {
        qb.whereNull(field);
      } else {
        qb.whereRaw('?? = ?', [field, scalar]);
      }
      break;

    case '!=':
    case '<>':
      if (value === null) {
        qb.whereNotNull(field);
      } else {
        qb.whereRaw('?? != ?', [field, scalar]);
      }
      break;

    case '>':
    case '>=':
    case '<':
    case '<=':
      qb.whereRaw(`?? ${op} ?`, [field, scalar]);
      break;

    case 'in': {
      const list = Array.isArray(value) ? value : [value];
      qb.whereIn(field, list);
      break;
    }

    case 'not in': {
      const list = Array.isArray(value) ? value : [value];
      qb.whereNotIn(field, list);
      break;
    }

    case 'like':
      qb.whereRaw('?? LIKE ?', [field, scalar]);
      break;

    case 'ilike':
      // Knex supports whereILike natively for Postgres and falls back gracefully
      qb.whereRaw('LOWER(??) LIKE LOWER(?)', [field, value]);
      break;

    case 'not like':
      qb.whereRaw('?? NOT LIKE ?', [field, scalar]);
      break;

    case 'not ilike':
      qb.whereRaw('LOWER(??) NOT LIKE LOWER(?)', [field, value]);
      break;

    case '=like':
      qb.whereRaw('?? LIKE ?', [field, scalar]);
      break;

    case 'is null':
      qb.whereNull(field);
      break;

    case 'is not null':
      qb.whereNotNull(field);
      break;

    default:
      throw new Error(`Unsupported domain operator: ${op}`);
  }
}

/**
 * Applies a filter domain directly to an Objection QueryBuilder.
 */
export function applyDomain<QB>(qb: QB, domain?: Domain): QB {
  if (!domain || domain.length === 0) {
    return qb;
  }
  const ast = parseDomainToAST(domain);
  if (ast) {
    applyAstToQuery(qb as DomainQuery, ast);
  }
  return qb;
}
