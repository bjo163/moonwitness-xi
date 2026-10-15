import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyDocumentationFiles } from './docs-change-policy.mjs';

test('classifies only human-readable Markdown content as docs-only', () => {
  for (const file of ['README.md', 'ROADMAP.md', 'docs/guide/how-to/example.md']) {
    assert.equal(classifyDocumentationFiles([{ path: file, status: 'M' }]).docsOnly, true, file);
  }
});

test('excludes executable generators, workflow, manifests, assets, and application code', () => {
  for (const file of [
    'scripts/docs/build-guide.mjs',
    '.github/workflows/pages.yml',
    'package.json',
    'pnpm-lock.yaml',
    'apps/docs/src/app.tsx',
    'packages/assets/src/logo.svg',
    'docs/guide/reference/schema.json',
  ]) {
    assert.equal(classifyDocumentationFiles([{ path: file, status: 'M' }]).docsOnly, false, file);
  }
});

test('mixed documentation and executable changes are not content-only', () => {
  assert.equal(
    classifyDocumentationFiles([
      { path: 'docs/guide/how-to/example.md', status: 'M' },
      { path: 'scripts/docs/build-guide.mjs', status: 'M' },
    ]).docsOnly,
    false
  );
  assert.equal(
    classifyDocumentationFiles([
      { path: 'docs/guide/example.md', previousPath: 'scripts/example.ts' },
    ]).docsOnly,
    false
  );
  assert.equal(classifyDocumentationFiles([]).docsOnly, false);
});
