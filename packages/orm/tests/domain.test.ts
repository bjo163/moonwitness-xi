import { describe, it, expect } from 'vitest';
import { parseDomainToAST, normalizeLeaf, validateDomain, type ASTNode } from '../src/domain.js';
import type { Domain } from '../src/types.js';

const generatedFields = ['id', 'active', 'name', 'company_id'] as const;
const generatedOperators = ['=', '!=', '>', '>=', '<', '<=', 'ilike', 'in', 'not in'] as const;
const generatedScalars: Array<string | number | boolean | null> = [
  '',
  'MoonWitness',
  '東京',
  0,
  -1,
  42.5,
  true,
  false,
  null,
];
const allowedGeneratedFields = new Set<string>(generatedFields);
const allowedGeneratedOperators = new Set<string>(generatedOperators);

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function choose<T>(random: () => number, values: readonly T[]): T {
  const index = Math.floor(random() * values.length);
  const value = values[index];
  if (value === undefined) throw new Error('Cannot choose from an empty list');
  return value;
}

function generatedLeaf(random: () => number): unknown[] {
  const field = choose(random, generatedFields);
  const operator = choose(random, generatedOperators);
  if (operator === 'in' || operator === 'not in') {
    const length = Math.floor(random() * 6);
    const values = Array.from({ length }, () => choose(random, generatedScalars));
    return [field, operator, values];
  }
  if (operator === 'ilike') {
    return [
      field,
      operator,
      choose(
        random,
        generatedScalars.filter((value) => typeof value === 'string')
      ),
    ];
  }
  return [field, operator, choose(random, generatedScalars)];
}

function generatedExpression(
  random: () => number,
  remainingDepth: number
): { terms: unknown[]; leaves: number; depth: number } {
  if (remainingDepth === 0 || random() < 0.35)
    return { terms: [generatedLeaf(random)], leaves: 1, depth: 1 };

  const operator = choose(random, ['&', '|', '!'] as const);
  if (operator === '!') {
    const child = generatedExpression(random, remainingDepth - 1);
    return { terms: ['!', ...child.terms], leaves: child.leaves, depth: child.depth + 1 };
  }

  const left = generatedExpression(random, remainingDepth - 1);
  const right = generatedExpression(random, remainingDepth - 1);
  return {
    terms: [operator, ...left.terms, ...right.terms],
    leaves: left.leaves + right.leaves,
    depth: Math.max(left.depth, right.depth) + 1,
  };
}

function assertGeneratedAst(node: ASTNode, expected: { leaves: number; depth: number }): void {
  let leaves = 0;
  function visit(current: ASTNode): number {
    if (current.type === 'LEAF') {
      leaves += 1;
      expect(allowedGeneratedFields.has(current.field)).toBe(true);
      expect(allowedGeneratedOperators.has(current.op)).toBe(true);
      return 1;
    }
    if (current.type === 'NOT') return visit(current.child) + 1;
    return Math.max(visit(current.left), visit(current.right)) + 1;
  }
  expect(visit(node)).toBe(expected.depth);
  expect(leaves).toBe(expected.leaves);
}

describe('Domain Parser', () => {
  it('rejects malformed leaves, unsafe values, unknown operators, and over-deep expressions', () => {
    expect(() => validateDomain([['name', 'between', ['A', 'Z']]])).toThrow(
      "operator 'between' is not supported"
    );
    expect(() => validateDomain([['name', '=', { nested: 'value' }]])).toThrow(
      'must use a scalar or a bounded scalar list'
    );
    expect(() => validateDomain([['name', '=', ['not', 'an', 'equality']]])).toThrow(
      'does not accept a list'
    );
    expect(() => validateDomain([['bad field', '=', 'value']])).toThrow('invalid field');
    expect(() =>
      validateDomain([['missing_column', '=', 'value']], new Set(['id', 'name']))
    ).toThrow("field 'missing_column' is not queryable");
    expect(() =>
      validateDomain([['missing_column', '=', 'value']], new Set(['id', 'name']))
    ).toThrow("field 'missing_column' is not queryable");
    expect(() => validateDomain([['name', '=', 'x'.repeat(4097)]])).toThrow('value is too long');
    const deepDomain = [...Array<string>(33).fill('!'), ['active', '=', true]];
    expect(() => parseDomainToAST(validateDomain(deepDomain))).toThrow(
      'expression nesting exceeds 32'
    );
    expect(() => validateDomain(Array.from({ length: 101 }, () => ['id', '=', 1]))).toThrow(
      'at most 100 terms'
    );
  });

  it('fuzzes bounded valid expressions and adversarial untrusted inputs reproducibly', () => {
    const random = seededRandom(0x4d57444f);
    for (let sample = 0; sample < 256; sample += 1) {
      const generated = generatedExpression(random, 6);
      const domain = validateDomain(generated.terms, allowedGeneratedFields);
      const ast = parseDomainToAST(domain);
      expect(ast).not.toBeNull();
      if (ast) assertGeneratedAst(ast, generated);
    }

    const invalidInputs: Array<() => unknown> = [
      () => null,
      () => ({ field: 'name', value: 'unsafe' }),
      () => Array.from({ length: 101 }, () => generatedLeaf(random)),
      () => [[choose(random, generatedFields), 'unknown-op', choose(random, generatedScalars)]],
      () => [[choose(random, ['', 'bad field', 'name;drop table users']), '=', 'value']],
      () => [[choose(random, generatedFields), '=', { nested: choose(random, generatedScalars) }]],
      () => [[choose(random, generatedFields), '=', Number.POSITIVE_INFINITY]],
      () => [[choose(random, generatedFields), '=', 'x'.repeat(4097)]],
      () => [[choose(random, generatedFields), 'in', Array.from({ length: 501 }, () => 1)]],
      () => [...Array<string>(33).fill('!'), generatedLeaf(random)],
      () => ['&', generatedLeaf(random)],
      () => ['!', '!'],
    ];

    invalidInputs.forEach((createInput, index) => {
      expect(
        () => validateDomain(createInput(), allowedGeneratedFields),
        `invalid case ${index}`
      ).toThrow();
    });
  });

  it('should normalize leaf pairs and triplets', () => {
    expect(normalizeLeaf(['name', 'Alice'])).toEqual({
      field: 'name',
      op: '=',
      value: 'Alice',
    });

    expect(normalizeLeaf(['age', '>=', 18])).toEqual({
      field: 'age',
      op: '>=',
      value: 18,
    });
  });

  it('should parse single leaf', () => {
    const domain: Domain = [['state', '=', 'draft']];
    const ast = parseDomainToAST(domain);
    expect(ast).toEqual({
      type: 'LEAF',
      field: 'state',
      op: '=',
      value: 'draft',
    });
  });

  it('should parse consecutive leaves with implicit AND', () => {
    const domain: Domain = [
      ['is_company', '=', true],
      ['name', 'ilike', 'corp'],
    ];
    const ast = parseDomainToAST(domain);
    expect(ast).toEqual({
      type: 'AND',
      left: { type: 'LEAF', field: 'is_company', op: '=', value: true },
      right: { type: 'LEAF', field: 'name', op: 'ilike', value: 'corp' },
    });
  });

  it('should parse OR prefix operator', () => {
    const domain: Domain = ['|', ['state', '=', 'draft'], ['state', '=', 'sent']];
    const ast = parseDomainToAST(domain);
    expect(ast).toEqual({
      type: 'OR',
      left: { type: 'LEAF', field: 'state', op: '=', value: 'draft' },
      right: { type: 'LEAF', field: 'state', op: '=', value: 'sent' },
    });
  });

  it('should parse NOT prefix operator', () => {
    const domain: Domain = ['!', ['active', '=', false]];
    const ast = parseDomainToAST(domain);
    expect(ast).toEqual({
      type: 'NOT',
      child: { type: 'LEAF', field: 'active', op: '=', value: false },
    });
  });

  it('should parse complex nested prefix operators', () => {
    // ['|', ['is_company', '=', true], '&', ['city', '=', 'Jakarta'], ['street', '!=', '']]
    const domain: Domain = [
      '|',
      ['is_company', '=', true],
      '&',
      ['city', '=', 'Jakarta'],
      ['street', '!=', ''],
    ];
    const ast = parseDomainToAST(domain);
    expect(ast).toEqual({
      type: 'OR',
      left: { type: 'LEAF', field: 'is_company', op: '=', value: true },
      right: {
        type: 'AND',
        left: { type: 'LEAF', field: 'city', op: '=', value: 'Jakarta' },
        right: { type: 'LEAF', field: 'street', op: '!=', value: '' },
      },
    });
  });
});
