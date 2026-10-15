import assert from 'node:assert/strict';
import test from 'node:test';
import { validateNavigation } from './check-doc-navigation.mjs';

const validNavigation = {
  schemaVersion: 1,
  title: 'Docs',
  sections: [
    {
      title: 'Start',
      items: [{ title: 'Quickstart', kind: 'tutorial', path: 'docs/guide/start.md' }],
    },
  ],
};

test('accepts a valid, rooted documentation navigation map', async () => {
  assert.deepEqual(await validateNavigation(validNavigation, async () => true), []);
});

test('rejects missing and duplicate navigation targets', async () => {
  const navigation = {
    ...validNavigation,
    sections: [
      validNavigation.sections[0],
      {
        title: 'More',
        items: [{ title: 'Duplicate', kind: 'reference', path: 'docs/guide/start.md' }],
      },
    ],
  };
  const errors = await validateNavigation(navigation, async () => false);
  assert.equal(
    errors.some((error) => error.includes('Duplicate navigation path')),
    true
  );
  assert.equal(errors.filter((error) => error.includes('does not exist')).length, 2);
});

test('rejects traversal, non-doc paths, and unknown page kinds', async () => {
  const navigation = {
    ...validNavigation,
    sections: [
      {
        title: 'Unsafe',
        items: [
          { title: 'Traversal', kind: 'how-to', path: 'docs/../.env' },
          { title: 'Outside', kind: 'how-to', path: 'README.md' },
          { title: 'Unknown', kind: 'blog', path: 'docs/guide/post.md' },
        ],
      },
    ],
  };
  const errors = await validateNavigation(navigation, async () => true);
  assert.equal(
    errors.some((error) => error.includes('stay under docs/')),
    true
  );
  assert.equal(
    errors.some((error) => error.includes('Invalid navigation item')),
    true
  );
});
