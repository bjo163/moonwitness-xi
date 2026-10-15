import { describe, expect, it } from 'vitest';
import { isKnowledgeRecord, validateKnowledgeRecord } from '../src/index.js';
import type { KnowledgeRecord } from '../src/types.js';

const validConcept = {
  id: 'mw:concept:synthetic-alpha',
  kind: 'Concept',
  schema_version: 1,
  lifecycle: 'candidate',
  created_at: '2026-10-15T00:00:00Z',
  updated_at: '2026-10-15T00:00:00Z',
  origin_ref: 'synthetic:fixture:concept-alpha',
  visibility: 'INTERNAL',
  content_revision: 1,
} satisfies KnowledgeRecord;

describe('knowledge record envelope', () => {
  it('accepts each core kernel kind with explicit non-public classification', () => {
    const record = { ...validConcept, kind: 'Assertion' } satisfies KnowledgeRecord;

    expect(validateKnowledgeRecord(record)).toEqual({ valid: true, issues: [] });
    expect(isKnowledgeRecord(record)).toBe(true);
  });

  it('reports the JSON Pointer for missing required fields', () => {
    const { id: _omitted, ...missingId } = validConcept;

    expect(validateKnowledgeRecord(missingId)).toMatchObject({
      valid: false,
      issues: [expect.objectContaining({ path: '/id', keyword: 'required' })],
    });
  });

  it('rejects unknown kinds, missing visibility, and malformed timestamps', () => {
    expect(validateKnowledgeRecord({ ...validConcept, kind: 'Unknown' })).toMatchObject({
      valid: false,
      issues: [expect.objectContaining({ path: '/kind' })],
    });
    expect(validateKnowledgeRecord({ ...validConcept, visibility: undefined })).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([expect.objectContaining({ path: '/visibility' })]),
    });
    expect(validateKnowledgeRecord({ ...validConcept, created_at: 'not-a-date' })).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([expect.objectContaining({ path: '/created_at' })]),
    });
  });

  it('rejects undeclared fields instead of silently preserving them', () => {
    expect(validateKnowledgeRecord({ ...validConcept, public_by_default: true })).toMatchObject({
      valid: false,
      issues: [
        expect.objectContaining({ path: '/public_by_default', keyword: 'additionalProperties' }),
      ],
    });
  });
});
