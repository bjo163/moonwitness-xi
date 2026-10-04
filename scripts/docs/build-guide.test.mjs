import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuideBundle } from './build-guide.mjs';

const navigation = {
  schemaVersion: 1,
  title: 'Guide',
  sections: [
    {
      title: 'Start',
      items: [
        { title: 'Quickstart', kind: 'tutorial', path: 'docs/guide/tutorials/quickstart.md' },
      ],
    },
  ],
};

test('guide bundle is deterministic and retains navigation metadata and markdown', () => {
  const pages = { 'docs/guide/tutorials/quickstart.md': '# Quickstart\n\nRun the local app.\n' };
  const first = createGuideBundle(navigation, pages, 'source-fingerprint');
  const second = createGuideBundle(navigation, pages, 'source-fingerprint');
  assert.deepEqual(first, second);
  assert.equal(first.sections[0]?.items[0]?.markdown, pages['docs/guide/tutorials/quickstart.md']);
});

test('guide build rejects invalid navigation, traversal, and missing page content', () => {
  assert.throws(() => createGuideBundle({}, {}, 'fingerprint'), /invalid navigation/u);
  assert.throws(
    () =>
      createGuideBundle(
        {
          ...navigation,
          sections: [{ title: 'Unsafe', items: [{ path: 'docs/guide/../../.env' }] }],
        },
        {},
        'fingerprint'
      ),
    /unsafe/u
  );
  assert.throws(() => createGuideBundle(navigation, {}, 'fingerprint'), /content is missing/u);
});
