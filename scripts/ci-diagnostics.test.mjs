import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { summarizeJunitFailures } from './summarize-junit-failures.mjs';
import { renderUnitRunnerFailureReport } from './unit-runner-report.mjs';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const unitRunner = readFileSync('scripts/run-unit-tests.mjs', 'utf8');

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

test('unit runner records a safe phase name when it fails before writing a suite report', () => {
  const report = renderUnitRunnerFailureReport('API build <failed>', 2);

  assert.deepEqual(summarizeJunitFailures(report), ['unit-runner :: API build <failed> exited 2']);
  assert.doesNotMatch(report, /compiler output|password|token/u);
  assert.match(unitRunner, /renderUnitRunnerFailureReport\(label, result\.status \?\? 1\)/u);
  assert.match(unitRunner, /renderUnitRunnerFailureReport\(label, 1\)/u);
  assert.throws(() => renderUnitRunnerFailureReport('Build', 0), /non-zero exit code/u);
});

test('unit runner executes each workspace package suite only once', () => {
  const suiteBlock = unitRunner.match(/const suites = \[([\s\S]*?)\n\];/u)?.[1];
  assert.ok(suiteBlock, 'unit runner suite list should be present');

  const packageNames = [...suiteBlock.matchAll(/packageName: '([^']+)'/gu)].map(
    (match) => match[1]
  );
  assert.ok(packageNames.length > 0, 'unit runner should define workspace package suites');
  assert.equal(new Set(packageNames).size, packageNames.length, 'package suites must be unique');
});
