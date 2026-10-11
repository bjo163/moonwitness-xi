import { describe, expect, it } from 'vitest';
import {
  queryGraphIsBounded,
  relationExpression,
  rpcSearchReadIsBounded,
  userGraphAllowed,
} from '../src/routes/generic-query-graph.js';

describe('generic query relation graph policy', () => {
  it('normalizes comma-separated relation lists for Objection', () => {
    expect(relationExpression(' partner,language ')).toBe('[partner,language]');
    expect(relationExpression('[partner, language]')).toBe('[partner, language]');
    expect(relationExpression('partner.addresses.country')).toBe('partner.addresses.country');
    expect(relationExpression('  ')).toBe('');
    expect(relationExpression(undefined)).toBeUndefined();
  });

  it('limits ordinary users to explicitly approved model relation graphs', () => {
    expect(userGraphAllowed('user', 'base.partner', 'category_links.category')).toBe(true);
    expect(userGraphAllowed('user', 'base.partner', 'partner,language')).toBe(false);
    expect(userGraphAllowed('user', 'base.user', 'partner')).toBe(false);
    expect(userGraphAllowed('superadmin', 'base.user', 'partner,language')).toBe(true);
    expect(userGraphAllowed('user', 'base.partner', undefined)).toBe(true);
  });

  it('bounds graph depth, total length, and empty path segments', () => {
    expect(queryGraphIsBounded(undefined)).toBe(true);
    expect(queryGraphIsBounded('partner.addresses.country')).toBe(true);
    expect(queryGraphIsBounded('partner.addresses.country.extra')).toBe(false);
    expect(queryGraphIsBounded('[partner,,language]')).toBe(false);
    expect(queryGraphIsBounded('x'.repeat(513))).toBe(false);
  });

  it('bounds RPC field selection and ordering together with its relation graph', () => {
    expect(
      rpcSearchReadIsBounded({ fields: ['id', 'name'], with: 'partner', order: 'name asc' })
    ).toBe(true);
    expect(rpcSearchReadIsBounded({ fields: Array.from({ length: 101 }, () => 'id') })).toBe(false);
    expect(rpcSearchReadIsBounded({ order: 'x'.repeat(513) })).toBe(false);
    expect(rpcSearchReadIsBounded({ with: 'partner.addresses.country.extra' })).toBe(false);
  });
});
