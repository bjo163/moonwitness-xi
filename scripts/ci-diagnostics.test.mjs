import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');

test('failed unit and PostgreSQL jobs annotate testcase names before report scanning', () => {
  assert.match(workflow, /id: unit_tests\s+run: pnpm test:unit:ci/u);
  assert.match(workflow, /id: postgres_tests\s+run: pnpm test:integration/u);
  assert.match(
    workflow,
    /if: always\(\) && \(steps\.unit_tests\.outcome == 'failure' \|\| steps\.postgres_tests\.outcome == 'failure'\)[\s\S]*?run: node scripts\/summarize-junit-failures\.mjs test-results\/junit/u
  );

  const annotation = workflow.indexOf('Annotate failed unit and integration testcase names');
  const scanner = workflow.indexOf('Scan reports for secrets before artifact upload');
  assert.ok(annotation >= 0 && scanner > annotation);
});

test('diagnostic report names do not enable upload when the sanitizer rejects JUnit', () => {
  assert.match(workflow, /steps\.scan_reports\.outcome == 'success'/u);
  assert.match(
    workflow,
    /Scan reports for secrets before artifact upload[\s\S]*?run: node scripts\/scan-test-reports\.mjs/u
  );
});
