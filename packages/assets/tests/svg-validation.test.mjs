import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSvg } from '../scripts/validate.mjs';

function fixture(content, attributes = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" role="img" aria-label="Validation fixture"${attributes}><title>Validation fixture</title>${content}</svg>`;
}

test('accepts self-contained accessible SVG and verifies prefixed local references', () => {
  const svg = fixture(
    '<defs><linearGradient id="mw-icons-fixture-fill"><stop offset="0" stop-color="currentColor"/></linearGradient></defs><path d="M2 2h20v20H2z" fill="url(#mw-icons-fixture-fill)"/>'
  );
  const result = validateSvg(svg, 'icons/fixture.svg');
  assert.deepEqual([...result.ids], ['mw-icons-fixture-fill']);
  assert.equal(result.viewBox, '0 0 24 24');
});

test('rejects scripts, event handlers, embedded HTML, inline style and external URLs', () => {
  const invalid = [
    fixture('<script>alert(1)</script>'),
    fixture('<path onload="alert(1)" d="M0 0h1"/>'),
    fixture('<foreignObject><div>unsafe</div></foreignObject>'),
    fixture('<path style="fill:red" d="M0 0h1"/>'),
    fixture('<use href="https://example.test/icon.svg#mark"/>'),
    fixture('<path fill="url(https://example.test/paint.svg#red)" d="M0 0h1"/>'),
    `<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>${fixture('')}`,
  ];

  for (const source of invalid) assert.throws(() => validateSvg(source, 'icons/fixture.svg'));
});

test('rejects duplicate, unprefixed and unresolved SVG IDs', () => {
  assert.throws(
    () =>
      validateSvg(
        fixture('<path id="mw-icons-fixture-shape"/><path id="mw-icons-fixture-shape"/>'),
        'icons/fixture.svg'
      ),
    /duplicate id/u
  );
  assert.throws(
    () => validateSvg(fixture('<path id="gradient-1"/>'), 'icons/fixture.svg'),
    /id must use/u
  );
  assert.throws(
    () =>
      validateSvg(fixture('<path fill="url(#mw-icons-fixture-missing)"/>'), 'icons/fixture.svg'),
    /unresolved local reference/u
  );
});

test('rejects malformed nesting and inaccessible roots', () => {
  assert.throws(
    () => validateSvg(fixture('<g><path/></svg>'), 'icons/fixture.svg'),
    /invalid closing tag/u
  );
  assert.throws(
    () => validateSvg(fixture('<path/>').replace('role="img"', ''), 'icons/fixture.svg'),
    /accessible image label/u
  );
});
