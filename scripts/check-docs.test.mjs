import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  collectMarkdownAnchors,
  findBrokenMarkdownLinks,
  slugHeading,
  stripFencedCode,
} from './check-docs.mjs';

test('heading anchors follow stable GitHub-like slugs and duplicate headings', () => {
  const anchors = collectMarkdownAnchors(
    '# Addon `base`\n\n## Access & roles\n\n## Repeated\n\n## Repeated\n'
  );
  assert.equal(anchors.has('addon-base'), true);
  assert.equal(anchors.has('access-roles'), true);
  assert.equal(anchors.has('repeated'), true);
  assert.equal(anchors.has('repeated-1'), true);
  assert.equal(slugHeading('User Profile / Settings'), 'user-profile-settings');
});

test('links in code blocks are ignored and local fragments are validated', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'moonwitness-doc-links-'));
  try {
    const guide = path.join(root, 'guide');
    await mkdir(guide, { recursive: true });
    const sourceFile = path.join(guide, 'start.md');
    const targetFile = path.join(guide, 'target.md');
    const outsideFile = path.join(root, 'outside.md');
    const source = [
      '# Start',
      '',
      '[valid](target.md#good-heading)',
      '[bad anchor](target.md#missing)',
      '[missing page](absent.md)',
      '[outside](../../outside.md)',
      '```md',
      '[ignored](ghost.md#nope)',
      '```',
    ].join('\n');
    await writeFile(sourceFile, source);
    await writeFile(targetFile, '# Good heading\n');
    await writeFile(outsideFile, '# Outside\n');
    assert.equal(stripFencedCode(source).includes('ghost.md'), false);
    assert.deepEqual(await findBrokenMarkdownLinks([sourceFile], root), [
      'guide/start.md:4: missing anchor target.md#missing',
      'guide/start.md:5: missing target absent.md',
      'guide/start.md:6: target escapes repository ../../outside.md',
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
