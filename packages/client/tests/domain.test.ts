import { describe, expect, it } from 'vitest';
import { evalDomain, evalTerm } from '../src/domain.js';

describe('evalDomain & evalTerm', () => {
  const record = {
    id: 1,
    name: 'Moon Enterprise',
    is_company: true,
    state: 'confirmed',
    priority: 10,
    active: true,
    tags: ['lead', 'vip'],
  };

  it('evaluates basic comparison operators', () => {
    expect(evalTerm(['is_company', '=', true], record)).toBe(true);
    expect(evalTerm(['is_company', '=', false], record)).toBe(false);
    expect(evalTerm(['state', '!=', 'draft'], record)).toBe(true);
    expect(evalTerm(['priority', '>=', 10], record)).toBe(true);
    expect(evalTerm(['priority', '<', 5], record)).toBe(false);
  });

  it('evaluates string matching with ilike', () => {
    expect(evalTerm(['name', 'ilike', 'moon'], record)).toBe(true);
    expect(evalTerm(['name', 'ilike', 'solar'], record)).toBe(false);
  });

  it('evaluates set inclusion with in and not in', () => {
    expect(evalTerm(['state', 'in', ['draft', 'confirmed']], record)).toBe(true);
    expect(evalTerm(['state', 'not in', ['draft', 'cancelled']], record)).toBe(true);
    expect(evalTerm(['state', 'in', ['draft', 'cancel']], record)).toBe(false);
  });

  it('evaluates Polish notation OR ("|")', () => {
    // ['|', ['is_company', '=', false], ['priority', '>', 5]]
    expect(evalDomain(['|', ['is_company', '=', false], ['priority', '>', 5]], record)).toBe(true);

    // ['|', ['is_company', '=', false], ['state', '=', 'draft']]
    expect(evalDomain(['|', ['is_company', '=', false], ['state', '=', 'draft']], record)).toBe(
      false
    );
  });

  it('evaluates Polish notation NOT ("!")', () => {
    expect(evalDomain(['!', ['active', '=', false]], record)).toBe(true);
    expect(evalDomain(['!', ['active', '=', true]], record)).toBe(false);
  });

  it('evaluates consecutive terms as implicit AND', () => {
    expect(
      evalDomain(
        [
          ['is_company', '=', true],
          ['state', '=', 'confirmed'],
        ],
        record
      )
    ).toBe(true);

    expect(
      evalDomain(
        [
          ['is_company', '=', true],
          ['state', '=', 'draft'],
        ],
        record
      )
    ).toBe(false);
  });

  it('handles boolean shortcuts and empty domains gracefully', () => {
    expect(evalDomain(true, record)).toBe(true);
    expect(evalDomain(false, record)).toBe(false);
    expect(evalDomain(undefined, record)).toBe(false);
    expect(evalDomain([], record)).toBe(true);
  });
});
