import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { URL } from 'node:url';

const css = await readFile(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

function declaration(token, selector = ':root') {
  const section = css.match(new RegExp(`${selector}\\s*\\{([^}]+)\\}`));
  assert.ok(section, `Missing ${selector} token block`);
  const value = section[1].match(new RegExp(`--mw-${token}:\\s*([^;]+);`));
  return value?.[1].trim();
}

function tokenValue(token, selector = ':root') {
  const value = declaration(token, selector);
  assert.ok(value, `Missing --mw-${token} in ${selector}`);
  return value;
}

function resolvedValue(token, selector) {
  const value = declaration(token, selector) ?? declaration(token, ':root');
  assert.ok(value, `Missing --mw-${token} in ${selector} and :root`);
  const reference = value.match(/^var\(--mw-([\w-]+)\)$/);
  return reference ? resolvedValue(reference[1], selector) : value;
}

function rgb(hex) {
  assert.match(hex, /^#[\da-f]{6}$/i, `Expected a six-digit hex color, received ${hex}`);
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
}

function luminance(hex) {
  const channels = rgb(hex).map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  );
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('package exposes explicit stylesheet and tree-shakeable typed icon entries', () => {
  assert.equal(packageJson.exports['./styles/tokens.css'], './src/styles/tokens.css');
  assert.deepEqual(packageJson.exports['./icons/*'], {
    types: './dist/icons/*.d.ts',
    import: './dist/icons/*.js',
  });
  assert.equal(packageJson.exports['./icons'].import, './dist/icons/index.js');
  assert.equal(packageJson.exports['./components/button'].import, './dist/components/button.js');
  assert.equal(packageJson.exports['./components.css'], './src/styles/components.css');
  assert.equal(packageJson.dependencies, undefined);
  assert.equal(packageJson.peerDependencies.react, '>=18');
  assert.equal(packageJson.peerDependenciesMeta.react.optional, true);
  assert.equal(packageJson.peerDependencies['radix-ui'], '>=1.6.7');
  assert.equal(packageJson.peerDependenciesMeta['radix-ui'].optional, true);
  assert.equal(packageJson.peerDependencies.sonner, '>=2');
  assert.equal(packageJson.peerDependenciesMeta.sonner.optional, true);
  for (const component of ['dialog', 'dropdown-menu', 'select', 'tabs', 'tooltip', 'toast']) {
    assert.equal(
      packageJson.exports[`./components/${component}`].import,
      `./dist/components/${component}.js`
    );
  }
});

test('semantic text pairs meet WCAG AA in both theme mappings', () => {
  const pairs = [
    ['foreground', 'background'],
    ['surface-foreground', 'surface'],
    ['muted-foreground', 'muted'],
    ['primary-foreground', 'primary'],
    ['destructive-foreground', 'destructive'],
    ['on-success', 'success'],
    ['on-warning', 'warning'],
    ['on-info', 'info'],
  ];

  for (const selector of [':root', '\\.dark']) {
    for (const [foregroundName, backgroundName] of pairs) {
      const foreground = resolvedValue(foregroundName, selector);
      const background = resolvedValue(backgroundName, selector);
      assert.ok(
        contrast(foreground, background) >= 4.5,
        `${foregroundName} on ${backgroundName} in ${selector} is below 4.5:1`
      );
    }
  }

  assert.equal(resolvedValue('foreground', ':root'), '#0d0d0d');
  assert.equal(resolvedValue('background', ':root'), '#f3efe4');
  assert.equal(resolvedValue('foreground', '\\.dark'), '#f3efe4');
  assert.equal(resolvedValue('background', '\\.dark'), '#0e0e10');
});

test('control boundaries and focus indicators meet the 3:1 non-text target', () => {
  for (const selector of [':root', '\\.dark']) {
    assert.ok(
      contrast(resolvedValue('border', selector), resolvedValue('surface', selector)) >= 3,
      `Border against surface in ${selector} is below 3:1`
    );
    assert.ok(
      contrast(resolvedValue('focus', selector), resolvedValue('background', selector)) >= 3,
      `Focus against background in ${selector} is below 3:1`
    );
  }
});

test('pink accent uses dark foreground instead of low-contrast white', () => {
  assert.ok(contrast(tokenValue('on-pink'), tokenValue('pink')) >= 4.5);
  assert.ok(contrast('#ffffff', tokenValue('pink')) < 4.5);
  assert.equal(tokenValue('destructive-foreground'), 'var(--mw-on-pink)');
});

test('status semantics and chart palette are theme-stable and chart-safe by contract', () => {
  for (const name of [
    'success',
    'warning',
    'info',
    'chart-1',
    'chart-2',
    'chart-3',
    'chart-4',
    'chart-5',
  ]) {
    assert.match(tokenValue(name), /^#[\da-f]{6}$/i);
    assert.equal(declaration(name, '\\.dark'), undefined);
  }
  assert.match(css, /Charts use color plus labels, shape, or line style/);
});

test('type, spacing, shape, shadow and reduced-motion scales are present', () => {
  for (const name of [
    'font-display',
    'font-sans',
    'font-mono',
    'font-size-xs',
    'line-height-normal',
    'space-1',
    'space-8',
    'radius-sm',
    'radius-lg',
    'shadow-ink',
    'motion-fast',
    'motion-normal',
  ]) {
    assert.ok(tokenValue(name).length > 0, `Expected --mw-${name}`);
  }
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /--mw-motion-normal:\s*0ms/);
});

test('shared tokens avoid app-specific global styling and external font loading', () => {
  assert.doesNotMatch(css, /@import\s+url|https?:\/\//i);
  assert.doesNotMatch(css, /(^|\})\s*(html|body|\*)\s*\{/);
});
