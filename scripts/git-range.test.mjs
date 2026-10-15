import assert from 'node:assert/strict';
import test from 'node:test';
import { parseChangedFiles } from './git-range.mjs';

test('parses added, modified, and deleted paths from a NUL-delimited diff', () => {
  assert.deepEqual(
    parseChangedFiles('A\0apps/board/new.tsx\0M\0apps/api/src/routes.ts\0D\0old file.ts\0'),
    [
      { status: 'A', path: 'apps/board/new.tsx' },
      { status: 'M', path: 'apps/api/src/routes.ts' },
      { status: 'D', path: 'old file.ts' },
    ]
  );
});

test('keeps both endpoints for renamed files so sensitive old paths remain detectable', () => {
  assert.deepEqual(parseChangedFiles('R100\0packages/auth/src/old.ts\0apps/board/src/new.tsx\0'), [
    {
      status: 'R',
      path: 'apps/board/src/new.tsx',
      previousPath: 'packages/auth/src/old.ts',
    },
  ]);
});
