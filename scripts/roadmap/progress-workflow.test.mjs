import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';

const workflow = await readFile(
  new URL('../../.github/workflows/roadmap-progress.yml', import.meta.url),
  'utf8'
);

test('progress report workflow reads dev and publishes only short-lived Markdown and JSON artifacts', () => {
  assert.match(workflow, /branches: \[dev\]/u);
  assert.match(
    workflow,
    /github\.event_name == 'schedule' \|\| github\.ref == 'refs\/heads\/dev'/u
  );
  assert.match(workflow, /ref: dev\n/u);
  assert.match(workflow, /mkdir -p dist\/roadmap-progress/u);
  assert.match(workflow, /permissions:\n\x20{2}contents: read\n/u);
  assert.doesNotMatch(workflow, /^\s+(?:issues|pull-requests|contents):\s+write\s*$/mu);
  assert.match(workflow, /--output dist\/roadmap-progress\/roadmap-progress\.md/u);
  assert.match(workflow, /--format json --output dist\/roadmap-progress\/roadmap-progress\.json/u);
  assert.match(workflow, /if-no-files-found: error/u);
  assert.match(workflow, /retention-days: 7/u);
});

test('progress workflow checks out the trusted dev ref without persisting credentials', () => {
  assert.match(workflow, /ref: dev\n[\s\S]{0,80}persist-credentials: false/u);
  assert.match(
    workflow,
    /github\.event_name == 'schedule' \|\| github\.ref == 'refs\/heads\/dev'/u
  );
});
