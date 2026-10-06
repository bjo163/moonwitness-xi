import { describe, it, expect } from 'vitest';
import { parseDomainToAST, normalizeLeaf, validateDomain } from '../src/domain.js';
import type { Domain } from '../src/types.js';

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
    expect(() => validateDomain([['name', '=', 'x'.repeat(4097)]])).toThrow('value is too long');
    const deepDomain = [...Array<string>(33).fill('!'), ['active', '=', true]];
    expect(() => parseDomainToAST(validateDomain(deepDomain))).toThrow(
      'expression nesting exceeds 32'
    );
    expect(() => validateDomain(Array.from({ length: 101 }, () => ['id', '=', 1]))).toThrow(
      'at most 100 terms'
    );
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
