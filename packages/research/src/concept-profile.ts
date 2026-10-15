import {
  createJsonSchemaValidator,
  type JsonSchemaContract,
  type KnowledgeValidationResult,
} from '@moonwitness/knowledge';
import conceptProfileSchema from '../../../ontology/domains/concept-profile.schema.json' with { type: 'json' };
import { validateResearchEvidenceReference, type ResearchEvidenceReference } from './evidence.js';

export type ConceptProfileReviewStatus = 'accepted' | 'rejected' | 'unreviewed' | 'conflicting';
export type ConceptProfileEvidenceAccess = 'readable' | 'denied';

/**
 * Trusted server-side resolver boundary. Implementations must read the canonical
 * evidence record, its current review consensus, and authorization state from
 * authoritative local stores. Never construct this result from request fields.
 */
export interface TrustedConceptEvidenceResolution {
  canonicalEvidence: ResearchEvidenceReference;
  reviewStatus: ConceptProfileReviewStatus;
  access: ConceptProfileEvidenceAccess;
}

export type TrustedConceptEvidenceResolver = (evidenceId: string) => Promise<unknown>;

export interface ConceptProfileValidationIssue {
  path: string;
  code: string;
  message: string;
}

export type ConceptProfileValidationResult =
  { valid: true; issues: [] } | { valid: false; issues: ConceptProfileValidationIssue[] };

const validateSchema = createJsonSchemaValidator(
  conceptProfileSchema as unknown as JsonSchemaContract,
  'does not match the scoped concept profile schema'
);

/** Structural schema validation without evidence resolution or trust claims. */
export function validateConceptProfile(value: unknown): KnowledgeValidationResult {
  return validateSchema(value);
}

/**
 * Validate a profile document and verify evidence for every accepted
 * interpretation. Resolver exceptions and incomplete/contradictory review or
 * access states fail closed. Review-event subjects are intentionally not used:
 * this contract requires review consensus bound directly to canonical evidence.
 */
export async function validateConceptProfileWithEvidence(
  value: unknown,
  resolveTrustedEvidence: TrustedConceptEvidenceResolver
): Promise<ConceptProfileValidationResult> {
  const structural = validateSchema(value);
  if (!structural.valid) {
    return {
      valid: false,
      issues: structural.issues.map(({ path, keyword, message }) => ({
        path,
        code: keyword,
        message,
      })),
    };
  }

  // Clone and fingerprint the complete schema-valid JSON input before any
  // resolver can yield control and mutate caller-owned objects.
  let snapshotJson: string;
  let snapshot: unknown;
  try {
    snapshotJson = stableJson(value);
    snapshot = JSON.parse(snapshotJson) as unknown;
  } catch {
    return {
      valid: false,
      issues: [
        {
          path: '',
          code: 'input_snapshot_failed',
          message: 'profile input could not be safely snapshotted',
        },
      ],
    };
  }
  const document = snapshot as {
    profiles: Array<{
      interpretations: Array<{
        status: string;
        evidence_ids: string[];
      }>;
    }>;
  };
  // Snapshot all evidence targets before the first resolver await.
  const targets = document.profiles.flatMap((profile, profileIndex) =>
    profile.interpretations.flatMap((interpretation, interpretationIndex) =>
      interpretation.status === 'accepted'
        ? interpretation.evidence_ids.map((evidenceId, evidenceIndex) => ({
            evidenceId,
            path: `/profiles/${profileIndex}/interpretations/${interpretationIndex}/evidence_ids/${evidenceIndex}`,
          }))
        : []
    )
  );
  const issues: ConceptProfileValidationIssue[] = [];
  for (const { evidenceId, path } of targets) {
    let rawResolution: unknown;
    try {
      rawResolution = await resolveTrustedEvidence(evidenceId);
    } catch {
      issues.push({
        path,
        code: 'resolver_failure',
        message: 'trusted evidence resolver failed',
      });
      continue;
    }
    if (rawResolution === null) {
      issues.push({
        path,
        code: 'evidence_missing',
        message: 'canonical evidence record did not resolve',
      });
      continue;
    }
    if (!isRecord(rawResolution) || !('canonicalEvidence' in rawResolution)) {
      issues.push({
        path,
        code: 'resolver_output_invalid',
        message: 'trusted evidence resolver returned a malformed result',
      });
      continue;
    }
    const rawEvidence = rawResolution.canonicalEvidence;
    if (
      !isRecord(rawEvidence) ||
      !validateResearchEvidenceReference(rawEvidence).valid ||
      rawEvidence.id !== evidenceId
    ) {
      issues.push({
        path,
        code: 'evidence_mismatch',
        message: 'resolved canonical evidence metadata is invalid or has a different identity',
      });
      continue;
    }
    if (
      rawResolution.reviewStatus !== 'accepted' &&
      rawResolution.reviewStatus !== 'rejected' &&
      rawResolution.reviewStatus !== 'unreviewed' &&
      rawResolution.reviewStatus !== 'conflicting'
    ) {
      issues.push({
        path,
        code: 'resolver_output_invalid',
        message: 'trusted evidence resolver returned an invalid review status',
      });
      continue;
    }
    if (rawResolution.access !== 'readable' && rawResolution.access !== 'denied') {
      issues.push({
        path,
        code: 'resolver_output_invalid',
        message: 'trusted evidence resolver returned an invalid access status',
      });
      continue;
    }
    const resolution = rawResolution as unknown as TrustedConceptEvidenceResolution;
    if (resolution.reviewStatus === 'conflicting') {
      issues.push({
        path,
        code: 'review_conflicting',
        message: 'canonical evidence has contradictory review decisions',
      });
      continue;
    }
    if (resolution.reviewStatus !== 'accepted') {
      issues.push({
        path,
        code: 'review_not_accepted',
        message: 'canonical evidence does not have accepted review status',
      });
      continue;
    }
    if (resolution.access !== 'readable') {
      issues.push({
        path,
        code: 'access_denied',
        message: 'canonical evidence is not readable in this authorization context',
      });
    }
  }
  try {
    if (stableJson(value) !== snapshotJson) {
      return {
        valid: false,
        issues: [
          {
            path: '',
            code: 'input_changed',
            message: 'profile input changed while evidence validation was in progress',
          },
        ],
      };
    }
  } catch {
    return {
      valid: false,
      issues: [
        {
          path: '',
          code: 'input_changed',
          message: 'profile input changed while evidence validation was in progress',
        },
      ],
    };
  }
  return issues.length ? { valid: false, issues } : { valid: true, issues: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isRecord(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new TypeError('value is not JSON serializable');
  return serialized;
}
