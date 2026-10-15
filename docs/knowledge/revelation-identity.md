# Revelation, witness, canon, and edition identity

The domain contract at [`ontology/domains/revelation-identity.schema.json`](../../ontology/domains/revelation-identity.schema.json)
keeps four identity classes separate:

| Class                | Core ID kind | Meaning                                                               |
| -------------------- | ------------ | --------------------------------------------------------------------- |
| `RevelationIdentity` | `Work`       | A named revelation identity, independent of a surviving text edition. |
| `TextualWitness`     | `Expression` | A specific textual witness with a source-artifact reference.          |
| `Canon`              | `Concept`    | A tradition-scoped canon or collection classification.                |
| `Edition`            | `Edition`    | A source-backed publication or representation of a textual witness.   |

Relations are directional and typed: `witness_of` connects a textual witness
to a revelation identity; `member_of_canon` connects a witness to a canon; and
`edition_of` connects an edition to a witness. The policy forbids inferred
identity equivalence and forbids inferring that canon membership establishes
the identity of a revelation. `explicit_identity_equivalence` is accepted only
when it carries evidence IDs. Conflicting accepted/rejected states for the same
relation are invalid.

[`corpus/reference/revelation-identity-example.json`](../../corpus/reference/revelation-identity-example.json)
contains four distinct named revelation identities: Qur’an, Taurat, Zabur, and
Injil. It intentionally contains no scripture text, canon assignment, edition,
or witness assertion. A schema-valid synthetic test exercises the witness,
canon, and edition relations; it is not a source record or rights decision.

This contract keeps source rights and source availability separate from
identity modeling. A witness must refer to a source artifact; an accepted
relation still needs evidence, and schema validation does not verify the truth
of that evidence or clear rights for publication.
