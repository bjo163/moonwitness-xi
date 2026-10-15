import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UserIcon } from '../dist/icons/user.js';
import { Avatar } from '../dist/components/avatar.js';
import { Badge } from '../dist/components/badge.js';
import { Button } from '../dist/components/button.js';
import { Checkbox } from '../dist/components/checkbox.js';
import { Input } from '../dist/components/input.js';
import { SelectField } from '../dist/components/select-field.js';
import { Dialog, DialogTrigger } from '../dist/components/dialog.js';
import { DropdownMenu, DropdownMenuTrigger } from '../dist/components/dropdown-menu.js';
import { Select, SelectTrigger, SelectValue } from '../dist/components/select.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../dist/components/tabs.js';
import { Tooltip, TooltipProvider, TooltipTrigger } from '../dist/components/tooltip.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const assetsRoot = resolve(root, '../assets/icons');
const sourceRoot = resolve(root, 'src/icons');
const distRoot = resolve(root, 'dist/icons');
const iconFiles = (await readdir(assetsRoot)).filter((file) => file.endsWith('.svg')).sort();

test('each static asset has a typed source and isolated compiled component subpath', async () => {
  assert.equal(iconFiles.length, 24);
  for (const file of iconFiles) {
    const name = file.slice(0, -4);
    const source = await readFile(resolve(sourceRoot, `${name}.tsx`), 'utf8');
    const compiled = await readFile(resolve(distRoot, `${name}.js`), 'utf8');
    assert.match(source, /SVGProps<SVGSVGElement>/u, name);
    assert.match(source, /useId\(\)/u, name);
    assert.match(source, /aria-hidden=\{title \? undefined : true\}/u, name);
    assert.match(source, /aria-labelledby=\{title \? titleId : undefined\}/u, name);
    assert.match(compiled, /currentColor/u, name);
    assert.doesNotMatch(compiled, /from ['"].*\/(?:index|icons)\.js/u, name);
  }
});

test('component barrel exposes every typed icon by stable name', async () => {
  const barrel = await readFile(resolve(sourceRoot, 'index.ts'), 'utf8');
  for (const file of iconFiles) {
    const component = `${file
      .slice(0, -4)
      .replace(/(^|-)([a-z])/gu, (_match, _separator, letter) => letter.toUpperCase())}Icon`;
    assert.match(barrel, new RegExp(`export \\{ ${component} \\}`, 'u'));
  }
});

test('icons are decorative by default and expose unique accessible title IDs on request', () => {
  const decorative = renderToStaticMarkup(createElement(UserIcon, { size: 20 }));
  assert.match(decorative, /aria-hidden="true"/u);
  assert.match(decorative, /width="20"/u);
  assert.doesNotMatch(decorative, /role="img"|<title/u);

  const labelled = renderToStaticMarkup(createElement(UserIcon, { title: 'Profile' }));
  assert.match(labelled, /role="img"/u);
  assert.match(labelled, /aria-labelledby="([^"]+)"/u);
  assert.match(labelled, /<title id="[^"]+">Profile<\/title>/u);

  const repeated = renderToStaticMarkup(
    createElement(
      'div',
      null,
      createElement(UserIcon, { title: 'First' }),
      createElement(UserIcon, { title: 'Second' })
    )
  );
  const titleIds = [...repeated.matchAll(/<title id="([^"]+)"/gu)].map(([, id]) => id);
  assert.equal(titleIds.length, 2);
  assert.notEqual(titleIds[0], titleIds[1]);
});

test('core controls preserve native form semantics and use package-owned styles', async () => {
  const button = renderToStaticMarkup(
    createElement(Button, { type: 'submit', variant: 'outline' }, 'Save')
  );
  assert.match(button, /<button[^>]*type="submit"/u);
  assert.match(button, /data-variant="outline"/u);

  const slottedButton = renderToStaticMarkup(
    createElement(Button, { asChild: true }, createElement('a', { href: '/profile' }, 'Profile'))
  );
  assert.match(slottedButton, /<a[^>]*href="\/profile"/u);
  assert.match(slottedButton, /data-slot="button"/u);

  const input = renderToStaticMarkup(
    createElement(Input, { type: 'email', name: 'email', required: true })
  );
  assert.match(input, /type="email"/u);
  assert.match(input, /name="email"/u);
  assert.match(input, /required=""/u);

  const checkbox = renderToStaticMarkup(
    createElement(Checkbox, { name: 'terms', value: 'accepted' })
  );
  assert.match(checkbox, /type="checkbox"/u);
  assert.match(checkbox, /name="terms"/u);

  const select = renderToStaticMarkup(
    createElement(
      SelectField,
      { name: 'language' },
      createElement('option', { value: 'en' }, 'English')
    )
  );
  assert.match(select, /<select[^>]*name="language"/u);
  assert.match(select, /<option value="en">English<\/option>/u);

  assert.match(
    renderToStaticMarkup(createElement(Badge, { variant: 'primary' }, 'Active')),
    /data-slot="badge"/u
  );
  assert.match(
    renderToStaticMarkup(createElement(Avatar, { name: 'Moon Witness' })),
    /aria-label="Moon Witness"[^>]*>MW</u
  );

  const componentCss = await readFile(resolve(root, 'src/styles/components.css'), 'utf8');
  for (const selector of [
    '.mw-ui-button',
    '.mw-ui-input',
    '.mw-ui-select',
    '.mw-ui-checkbox',
    '.mw-ui-badge',
    '.mw-ui-avatar',
    '.mw-ui-dialog-content',
    '.mw-ui-menu-content',
    '.mw-ui-select-trigger',
    '.mw-ui-tabs-list',
    '.mw-ui-tooltip-content',
  ]) {
    assert.ok(componentCss.includes(selector), `${selector} has package-owned styles`);
  }
  assert.match(componentCss, /^@layer components\s*\{/u);
  assert.match(componentCss, /prefers-reduced-motion/u);
});

test('interactive primitives retain native Radix roles', () => {
  const dialog = renderToStaticMarkup(
    createElement(Dialog, null, createElement(DialogTrigger, null, 'Open dialog'))
  );
  assert.match(dialog, /data-slot="dialog-trigger"/u);
  assert.match(dialog, /Open dialog/u);

  const menu = renderToStaticMarkup(
    createElement(DropdownMenu, null, createElement(DropdownMenuTrigger, null, 'Open menu'))
  );
  assert.match(menu, /data-slot="dropdown-menu-trigger"/u);

  const select = renderToStaticMarkup(
    createElement(
      Select,
      { defaultValue: 'one' },
      createElement(SelectTrigger, null, createElement(SelectValue))
    )
  );
  assert.match(select, /data-slot="select-trigger"/u);
  assert.match(select, /role="combobox"/u);

  const tabs = renderToStaticMarkup(
    createElement(
      Tabs,
      { defaultValue: 'overview' },
      createElement(TabsList, null, createElement(TabsTrigger, { value: 'overview' }, 'Overview')),
      createElement(TabsContent, { value: 'overview' }, 'Panel content')
    )
  );
  assert.match(tabs, /role="tablist"/u);
  assert.match(tabs, /role="tab"/u);
  assert.match(tabs, /aria-selected="true"/u);
  assert.match(tabs, /role="tabpanel"/u);

  const tooltip = renderToStaticMarkup(
    createElement(
      TooltipProvider,
      null,
      createElement(Tooltip, null, createElement(TooltipTrigger, null, 'Help'))
    )
  );
  assert.match(tooltip, /data-slot="tooltip-trigger"/u);
});
