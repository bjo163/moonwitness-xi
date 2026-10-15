export const knowledgeRecordKinds = [
  'Entity',
  'Agent',
  'Work',
  'Expression',
  'Edition',
  'Artifact',
  'Passage',
  'Content',
  'Term',
  'Concept',
  'Assertion',
  'Evidence',
  'ProvenanceActivity',
  'Relation',
  'Assessment',
  'ReviewDecision',
  'DatasetRelease',
  'ImportRun',
  'ExternalAlias',
] as const;

export type KnowledgeRecordKind = (typeof knowledgeRecordKinds)[number];

/** Classification values remain a proposed policy projection until K0-005 review. */
export const knowledgeVisibilityValues = [
  'PUBLIC_APPROVED',
  'INTERNAL',
  'CONFIDENTIAL',
  'RESTRICTED',
  'CHILD_SENSITIVE',
] as const;

export type KnowledgeVisibility = (typeof knowledgeVisibilityValues)[number];
export type KnowledgeLifecycle = 'draft' | 'candidate' | 'active' | 'superseded' | 'withdrawn';

/**
 * Shared envelope only. Identity grammar, source rights and provenance are
 * defined by later K1 tasks and deliberately are not inferred here.
 */
export interface KnowledgeRecordBase {
  id: string;
  kind: KnowledgeRecordKind;
  schema_version: number;
  lifecycle: KnowledgeLifecycle;
  created_at: string;
  updated_at: string;
  origin_ref: string;
  visibility: KnowledgeVisibility;
  content_revision: number;
}

export type KnowledgeRecord = {
  [Kind in KnowledgeRecordKind]: KnowledgeRecordBase & { kind: Kind };
}[KnowledgeRecordKind];

export interface KnowledgeValidationIssue {
  path: string;
  keyword: string;
  message: string;
}

export type KnowledgeValidationResult =
  { valid: true; issues: [] } | { valid: false; issues: KnowledgeValidationIssue[] };
