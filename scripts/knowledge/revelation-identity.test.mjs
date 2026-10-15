import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { URL } from 'node:url';

const requireKnowledgeDependency = createRequire(
  new URL('../../packages/knowledge/package.json', import.meta.url)
);
const Ajv2020 = requireKnowledgeDependency('ajv/dist/2020.js').default;
const addFormats = requireKnowledgeDependency('ajv-formats').default;
const schema = JSON.parse(
  await readFile(
    new URL('../../ontology/domains/revelation-identity.schema.json', import.meta.url),
    'utf8'
  )
);
const example = JSON.parse(
  await readFile(
    new URL('../../corpus/reference/revelation-identity-example.json', import.meta.url),
    'utf8'
  )
);
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

function validateDomain(dataset) {
  const errors = [];
  if (!validateSchema(dataset)) {
    errors.push(
      ...(validateSchema.errors ?? []).map((error) => error.message ?? 'schema violation')
    );
    return errors;
  }
  const entities = new Map();
  for (const entity of dataset.entities) {
    if (entities.has(entity.id)) errors.push(`duplicate entity ID: ${entity.id}`);
    entities.set(entity.id, entity.identityClass);
  }
  const relationIds = new Set();
  const relationStates = new Map();
  const expectedClasses = {
    witness_of: ['TextualWitness', 'RevelationIdentity'],
    member_of_canon: ['TextualWitness', 'Canon'],
    edition_of: ['Edition', 'TextualWitness'],
  };
  for (const relation of dataset.relations) {
    if (relationIds.has(relation.id)) errors.push(`duplicate relation ID: ${relation.id}`);
    relationIds.add(relation.id);
    const subjectClass = entities.get(relation.subjectId);
    const objectClass = entities.get(relation.objectId);
    if (!subjectClass || !objectClass) {
      errors.push(`dangling relation: ${relation.id}`);
      continue;
    }
    const expected = expectedClasses[relation.predicate];
    if (expected && (subjectClass !== expected[0] || objectClass !== expected[1])) {
      errors.push(`relation endpoint class mismatch: ${relation.id}`);
    }
    const key = `${relation.subjectId}\0${relation.predicate}\0${relation.objectId}`;
    const state = relationStates.get(key);
    if (state && state !== relation.status)
      errors.push(`contradictory relation state: ${relation.id}`);
    relationStates.set(key, relation.status);
  }
  return errors;
}

function copyExample() {
  return JSON.parse(JSON.stringify(example));
}

test('revelation example keeps the four named identities distinct and asserts no witness equivalence', () => {
  assert.equal(validateDomain(example).length, 0);
  assert.equal(example.entities.length, 4);
  assert.equal(new Set(example.entities.map(({ id }) => id)).size, 4);
  assert.ok(example.entities.every(({ identityClass }) => identityClass === 'RevelationIdentity'));
  assert.deepEqual(example.relations, []);
  assert.deepEqual(example.policy, {
    inferIdentityEquivalence: false,
    canonImpliesRevelationIdentity: false,
  });
});

test('supports typed witness, canon, edition, and explicitly evidenced relationship fixtures', () => {
  const dataset = copyExample();
  dataset.entities.push(
    {
      id: 'mw:expression:synthetic-witness',
      identityClass: 'TextualWitness',
      label: 'Synthetic witness fixture',
      sourceArtifactId: 'mw:artifact:synthetic-source',
    },
    {
      id: 'mw:concept:synthetic-canon',
      identityClass: 'Canon',
      label: 'Synthetic canon',
      tradition: 'test',
    },
    {
      id: 'mw:edition:synthetic-edition',
      identityClass: 'Edition',
      label: 'Synthetic edition',
      sourceArtifactId: 'mw:artifact:synthetic-edition-source',
    }
  );
  dataset.relations.push(
    {
      id: 'mw:relation:witness-source',
      subjectId: 'mw:expression:synthetic-witness',
      predicate: 'witness_of',
      objectId: 'mw:work:quran-revelation',
      status: 'candidate',
      evidenceIds: [],
    },
    {
      id: 'mw:relation:witness-canon',
      subjectId: 'mw:expression:synthetic-witness',
      predicate: 'member_of_canon',
      objectId: 'mw:concept:synthetic-canon',
      status: 'candidate',
      evidenceIds: [],
    },
    {
      id: 'mw:relation:edition-witness',
      subjectId: 'mw:edition:synthetic-edition',
      predicate: 'edition_of',
      objectId: 'mw:expression:synthetic-witness',
      status: 'candidate',
      evidenceIds: [],
    },
    {
      id: 'mw:relation:explicit-equivalence',
      subjectId: 'mw:expression:synthetic-witness',
      predicate: 'explicit_identity_equivalence',
      objectId: 'mw:work:quran-revelation',
      status: 'accepted',
      evidenceIds: ['mw:evidence:synthetic-review'],
    }
  );
  assert.deepEqual(validateDomain(dataset), []);
});

test('rejects class-incompatible, dangling, and contradictory relation fixtures', () => {
  const dataset = copyExample();
  dataset.entities.push({
    id: 'mw:expression:synthetic-witness',
    identityClass: 'TextualWitness',
    label: 'Synthetic witness fixture',
    sourceArtifactId: 'mw:artifact:synthetic-source',
  });
  dataset.relations.push(
    {
      id: 'mw:relation:wrong-endpoint',
      subjectId: 'mw:work:quran-revelation',
      predicate: 'witness_of',
      objectId: 'mw:work:taurat-revelation',
      status: 'candidate',
      evidenceIds: [],
    },
    {
      id: 'mw:relation:dangling',
      subjectId: 'mw:expression:synthetic-witness',
      predicate: 'witness_of',
      objectId: 'mw:work:missing-revelation',
      status: 'candidate',
      evidenceIds: [],
    },
    {
      id: 'mw:relation:candidate-state',
      subjectId: 'mw:expression:synthetic-witness',
      predicate: 'witness_of',
      objectId: 'mw:work:quran-revelation',
      status: 'candidate',
      evidenceIds: [],
    },
    {
      id: 'mw:relation:opposite-state',
      subjectId: 'mw:expression:synthetic-witness',
      predicate: 'witness_of',
      objectId: 'mw:work:quran-revelation',
      status: 'rejected',
      evidenceIds: [],
    }
  );
  assert.deepEqual(validateDomain(dataset), [
    'relation endpoint class mismatch: mw:relation:wrong-endpoint',
    'dangling relation: mw:relation:dangling',
    'contradictory relation state: mw:relation:opposite-state',
  ]);
});

test('requires reviewed evidence for accepted equivalence and rejects implicit canon identity', () => {
  const dataset = copyExample();
  dataset.policy.canonImpliesRevelationIdentity = true;
  assert.ok(validateDomain(dataset).some((error) => error.includes('must be equal to constant')));

  const equivalence = copyExample();
  equivalence.relations.push({
    id: 'mw:relation:unreviewed-equivalence',
    subjectId: 'mw:work:quran-revelation',
    predicate: 'explicit_identity_equivalence',
    objectId: 'mw:work:taurat-revelation',
    status: 'candidate',
    evidenceIds: [],
  });
  assert.ok(
    validateDomain(equivalence).some((error) => error.includes('must be equal to constant'))
  );

  const acceptedWithoutEvidence = copyExample();
  acceptedWithoutEvidence.relations.push({
    id: 'mw:relation:accepted-without-evidence',
    subjectId: 'mw:work:quran-revelation',
    predicate: 'explicit_identity_equivalence',
    objectId: 'mw:work:taurat-revelation',
    status: 'accepted',
    evidenceIds: [],
  });
  assert.ok(validateDomain(acceptedWithoutEvidence).length > 0);
});
