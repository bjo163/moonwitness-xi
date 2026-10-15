import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  validateConceptProfileWithEvidence,
  type TrustedConceptEvidenceResolution,
} from '../src/index.js';

const requireKnowledgeDependency = createRequire(
  new URL('../../../knowledge/package.json', import.meta.url)
);
const Ajv2020 = requireKnowledgeDependency('ajv/dist/2020.js').default;
const schema = JSON.parse(
  await readFile(
    new URL('../../../ontology/domains/concept-profile.schema.json', import.meta.url),
    'utf8'
  )
);
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
const evidenceId = 'mw:evidence:synthetic-reference';
const canonicalEvidence = {
  id: evidenceId,
  assertion_id: 'mw:assertion:synthetic-claim',
  direction: 'supporting' as const,
  selector: {
    source_id: 'mw:source:ebible-webp-protestant' as const,
    expression_id: 'mw:expression:webp-protestant',
    edition_id: 'mw:edition:webp-protestant-2020-stable' as const,
    locator: 'Genesis 1:1' as const,
    content_sha256: 'a'.repeat(64),
  },
};
const acceptedProfileDocument = () => {
  const accepted = profile('mercy-context-a', 'Synthetic tradition A', 'A bounded interpretation.');
  accepted.interpretations[0]!.status = 'accepted';
  accepted.interpretations[0]!.evidence_ids = [evidenceId];
  return { format: 'moonwitness-concept-profiles/v1', profiles: [accepted] };
};
const resolution = (
  overrides: Partial<TrustedConceptEvidenceResolution> = {}
): TrustedConceptEvidenceResolution => ({
  canonicalEvidence,
  reviewStatus: 'accepted',
  access: 'readable',
  ...overrides,
});

const profile = (id: string, tradition: string, text: string) => ({
  id: `mw:concept-profile:${id}`,
  concept_id: 'mw:concept:mercy',
  tradition,
  community_or_school: 'Synthetic study group',
  language: 'en',
  interpretive_scope: 'A bounded illustrative reading, not a universal definition.',
  epistemic_status: 'contested',
  uncertainty: { level: 'moderate', note: 'Synthetic example; not source-backed.' },
  interpretations: [
    {
      claim_type: 'human_interpretation',
      text,
      status: 'candidate',
      evidence_ids: [],
    },
  ],
});

describe('scoped concept profiles', () => {
  it('preserves divergent interpretations of one concept as separate situated profiles', () => {
    const document = {
      format: 'moonwitness-concept-profiles/v1',
      profiles: [
        profile('mercy-context-a', 'Synthetic tradition A', 'Emphasizes restorative care.'),
        profile('mercy-context-b', 'Synthetic tradition B', 'Emphasizes covenantal obligation.'),
      ],
    };
    expect(validate(document), JSON.stringify(validate.errors)).toBe(true);
    expect(document.profiles.map((item) => item.concept_id)).toEqual([
      'mw:concept:mercy',
      'mw:concept:mercy',
    ]);
    expect(document.profiles[0]?.interpretations[0]?.text).not.toBe(
      document.profiles[1]?.interpretations[0]?.text
    );
  });

  it('rejects profiles that blur interpretation into revelation or omit uncertainty', () => {
    const base = profile('mercy-context-a', 'Synthetic tradition A', 'A bounded interpretation.');
    const wrongClaimType = structuredClone(base);
    wrongClaimType.interpretations[0]!.claim_type = 'revelation' as 'human_interpretation';
    expect(
      validate({ format: 'moonwitness-concept-profiles/v1', profiles: [wrongClaimType] })
    ).toBe(false);

    const noUncertainty = structuredClone(base) as Record<string, unknown>;
    delete noUncertainty.uncertainty;
    expect(validate({ format: 'moonwitness-concept-profiles/v1', profiles: [noUncertainty] })).toBe(
      false
    );
  });

  it('requires evidence for an accepted human interpretation', () => {
    const accepted = profile(
      'mercy-context-a',
      'Synthetic tradition A',
      'A bounded interpretation.'
    );
    accepted.interpretations[0]!.status = 'accepted';
    expect(validate({ format: 'moonwitness-concept-profiles/v1', profiles: [accepted] })).toBe(
      false
    );
    accepted.interpretations[0]!.evidence_ids = ['mw:evidence:synthetic-reference'];
    expect(validate({ format: 'moonwitness-concept-profiles/v1', profiles: [accepted] })).toBe(
      true
    );
  });

  it('accepts only evidence resolved to matching canonical metadata with accepted review and read access', async () => {
    await expect(
      validateConceptProfileWithEvidence(acceptedProfileDocument(), async () => resolution())
    ).resolves.toEqual({ valid: true, issues: [] });
  });

  it('fails closed for missing and mismatched canonical evidence', async () => {
    const missing = await validateConceptProfileWithEvidence(
      acceptedProfileDocument(),
      async () => null
    );
    expect(missing.valid).toBe(false);
    if (!missing.valid) expect(missing.issues[0]?.code).toBe('evidence_missing');

    const mismatch = await validateConceptProfileWithEvidence(acceptedProfileDocument(), async () =>
      resolution({
        canonicalEvidence: { ...canonicalEvidence, id: 'mw:evidence:other' },
      })
    );
    expect(mismatch.valid).toBe(false);
    if (!mismatch.valid) expect(mismatch.issues[0]?.code).toBe('evidence_mismatch');
  });

  it('fails closed for unreviewed, rejected, or contradictory review status', async () => {
    for (const reviewStatus of ['unreviewed', 'rejected', 'conflicting'] as const) {
      const result = await validateConceptProfileWithEvidence(acceptedProfileDocument(), async () =>
        resolution({ reviewStatus })
      );
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.issues[0]?.code).toBe(
          reviewStatus === 'conflicting' ? 'review_conflicting' : 'review_not_accepted'
        );
      }
    }
  });

  it('fails closed for denied access and resolver exceptions', async () => {
    const denied = await validateConceptProfileWithEvidence(acceptedProfileDocument(), async () =>
      resolution({ access: 'denied' })
    );
    expect(denied.valid).toBe(false);
    if (!denied.valid) expect(denied.issues[0]?.code).toBe('access_denied');

    const failure = await validateConceptProfileWithEvidence(
      acceptedProfileDocument(),
      async () => {
        throw new Error('synthetic resolver failure');
      }
    );
    expect(failure.valid).toBe(false);
    if (!failure.valid) expect(failure.issues[0]?.code).toBe('resolver_failure');
  });

  it('rejects caller mutation while never querying evidence IDs injected during await', async () => {
    const document = acceptedProfileDocument();
    const ids = document.profiles[0]!.interpretations[0]!.evidence_ids;
    const requested: string[] = [];
    const result = await validateConceptProfileWithEvidence(document, async (id) => {
      requested.push(id);
      ids.push('mw:evidence:injected-after-validation');
      await Promise.resolve();
      return resolution();
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues[0]?.code).toBe('input_changed');
    expect(requested).toEqual([evidenceId]);
  });

  it('rejects a candidate interpretation changed to accepted during resolver await', async () => {
    const candidate = profile(
      'second-candidate',
      'Synthetic tradition B',
      'Another bounded interpretation.'
    );
    const accepted = acceptedProfileDocument();
    const document = {
      ...accepted,
      profiles: [...accepted.profiles, candidate],
    };
    const result = await validateConceptProfileWithEvidence(document, async () => {
      candidate.interpretations[0]!.status = 'accepted';
      candidate.interpretations[0]!.evidence_ids = ['mw:evidence:added-during-await'];
      await Promise.resolve();
      return resolution();
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues[0]?.code).toBe('input_changed');
  });

  it('reports malformed resolver output and nested canonical evidence as issues', async () => {
    for (const malformed of [
      undefined,
      {},
      { reviewStatus: 'accepted', access: 'readable' },
      { canonicalEvidence: null, reviewStatus: 'accepted', access: 'readable' },
      { canonicalEvidence: {}, reviewStatus: 'accepted', access: 'readable' },
      { canonicalEvidence, reviewStatus: 'unknown', access: 'readable' },
      { canonicalEvidence, reviewStatus: 'accepted', access: 'sometimes' },
    ]) {
      const result = await validateConceptProfileWithEvidence(
        acceptedProfileDocument(),
        async () => malformed
      );
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.issues[0]?.code).toMatch(/resolver_output_invalid|evidence_mismatch/u);
      }
    }
  });
});
