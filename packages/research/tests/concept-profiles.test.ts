import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { describe, expect, it } from 'vitest';

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
});
