import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkExternalUrls,
  extractExternalDocumentationUrls,
} from './check-external-doc-links.mjs';

test('extracts unique external Markdown links and ignores fenced examples', () => {
  assert.deepEqual(
    extractExternalDocumentationUrls(
      '[docs](https://example.com/a) [again](https://example.com/a)\n\n```md\n[x](https://ignored.example)\n```'
    ),
    ['https://example.com/a']
  );
});

test('retries transient failures and reports permanent external failures separately', async () => {
  const calls = new Map();
  const fetchMock = async (url) => {
    const count = (calls.get(url) ?? 0) + 1;
    calls.set(url, count);
    return {
      status: url.endsWith('/retry') && count === 1 ? 503 : url.endsWith('/missing') ? 404 : 200,
    };
  };
  const failures = await checkExternalUrls(
    ['https://example.com/retry', 'https://example.com/missing'],
    fetchMock,
    { attempts: 2, delayMs: 0 }
  );
  assert.deepEqual(failures, ['https://example.com/missing: HTTP 404 after 2 attempt(s)']);
  assert.equal(calls.get('https://example.com/retry'), 2);
});
