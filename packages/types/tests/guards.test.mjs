import assert from 'node:assert/strict';
import test from 'node:test';
import { isJsonObject, isJsonValue, isRecord } from '../dist/guards.js';

test('isRecord accepts non-null non-array objects only', () => {
  assert.equal(isRecord({ value: 1 }), true);
  assert.equal(isRecord(Object.create(null)), true);
  assert.equal(isRecord(null), false);
  assert.equal(isRecord([]), false);
  assert.equal(isRecord('value'), false);
});

test('isJsonValue accepts recursive JSON values and finite numbers', () => {
  assert.equal(isJsonValue(null), true);
  assert.equal(isJsonValue({ nested: [true, 1, 'value', null] }), true);
  assert.equal(isJsonValue(Number.MAX_VALUE), true);
  assert.equal(isJsonValue(Number.NaN), false);
  assert.equal(isJsonValue(Number.POSITIVE_INFINITY), false);
  assert.equal(isJsonValue(undefined), false);
  assert.equal(isJsonValue(1n), false);
  assert.equal(isJsonValue(new Date()), false);
  assert.equal(isJsonValue(new Map()), false);
});

test('isJsonValue rejects cyclic references without recursion overflow', () => {
  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(isJsonValue(cyclic), false);
});

test('isJsonValue allows shared non-cyclic subobjects', () => {
  const child = { ok: true };
  assert.equal(isJsonValue({ first: child, second: child }), true);
});

test('isJsonObject narrows only recursively valid object payloads', () => {
  assert.equal(isJsonObject({ id: 1, values: ['valid'] }), true);
  assert.equal(isJsonObject({ id: Number.NaN }), false);
  assert.equal(isJsonObject(new Date()), false);
  assert.equal(isJsonObject([]), false);
  assert.equal(isJsonObject(null), false);
});
