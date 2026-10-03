import type { JsonValue } from './types.js';
import type { Domain, DomainLeaf, DomainOperator } from './types.js';

export type ASTNode =
  | { type: 'LEAF'; field: string; op: DomainOperator; value: JsonValue }
  | { type: 'AND'; left: ASTNode; right: ASTNode }
  | { type: 'OR'; left: ASTNode; right: ASTNode }
  | { type: 'NOT'; child: ASTNode };

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
      stack.push({ type: 'AND', left, right });
    } else if (item === '|') {
      const left = stack.pop();
      const right = stack.pop();
      if (!left || !right) {
        throw new Error(`Invalid domain: '|' operator expects 2 arguments.`);
      }
      stack.push({ type: 'OR', left, right });
    } else if (item === '!') {
      const child = stack.pop();
      if (!child) {
        throw new Error(`Invalid domain: '!' operator expects 1 argument.`);
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
