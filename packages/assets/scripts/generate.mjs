import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const brandDirectory = resolve(packageRoot, 'brand');

const palettes = {
  light: { ink: '#0d0d0d', paper: '#f3efe4', accent: '#e6ff00' },
  dark: { ink: '#f3efe4', paper: '#0e0e10', accent: '#e6ff00' },
  'mono-light': { ink: '#0d0d0d', paper: '#fffdf6', accent: '#0d0d0d' },
  'mono-dark': { ink: '#fffdf6', paper: '#0e0e10', accent: '#fffdf6' },
};

const mark = (palette) => `
  <path d="M42.5 8.5A24 24 0 1 0 55 48A19.5 19.5 0 1 1 42.5 8.5Z" fill="${palette.accent}" stroke="${palette.ink}" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M7 43.5C17.5 56.2 41 59.2 56 44.4" fill="none" stroke="${palette.ink}" stroke-width="2.1" stroke-linecap="round"/>
  <path d="M49.5 7v12m-6-6h12m-10.2-4.2 8.4 8.4m0-8.4-8.4 8.4" fill="none" stroke="${palette.ink}" stroke-width="1.8" stroke-linecap="round"/>
`;

function svgDocument(viewBox, title, content, width, height, attributes = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}"${attributes} role="img" aria-label="${title}">
  <title>${title}</title>
${content}
</svg>\n`;
}

const icons = [
  {
    name: 'user',
    title: 'User',
    paths:
      '<circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c.7-3.4 3.4-5.5 7.5-5.5s6.8 2.1 7.5 5.5"/>',
  },
  {
    name: 'partner',
    title: 'Partner contact',
    paths:
      '<circle cx="9" cy="8" r="3"/><path d="M3.5 19c.5-2.9 2.5-4.5 5.5-4.5 2.2 0 3.8.9 4.7 2.6"/><rect x="14" y="5" width="6.5" height="11" rx="1"/><path d="M15.7 8h3.1m-3.1 2.7h3.1m-3.1 2.7h1.7"/><path d="M15.5 20h4"/>',
  },
  {
    name: 'company',
    title: 'Company',
    paths:
      '<path d="M3.5 20V8.5l6.5-3V20m0-9 10.5-4V20H3.5Zm0 0h17"/><path d="M6.5 10.5v1m0 3v1m6-2v1m0 3v1m4.5-8v1m0 3v1m0 3v1"/>',
  },
  {
    name: 'team',
    title: 'Team',
    paths:
      '<circle cx="12" cy="7" r="2.8"/><circle cx="5" cy="9" r="2.1"/><circle cx="19" cy="9" r="2.1"/><path d="M7 19c.4-3.2 2-4.8 5-4.8s4.6 1.6 5 4.8m-14.5-.5c.3-2.3 1.3-3.5 3.2-3.8m13.8 3.8c-.3-2.3-1.3-3.5-3.2-3.8"/>',
  },
  {
    name: 'addon',
    title: 'Addon module',
    paths:
      '<path d="M4 4h6v3a2 2 0 1 0 4 0V4h6v6h-3a2 2 0 1 0 0 4h3v6h-6v-3a2 2 0 1 0-4 0v3H4v-6h3a2 2 0 1 0 0-4H4V4Z"/>',
  },
  {
    name: 'model',
    title: 'Data model',
    paths:
      '<rect x="3.5" y="4" width="17" height="16" rx="1"/><path d="M3.5 9h17M9 9v11m6-11v11M3.5 14.5h17"/>',
  },
  {
    name: 'field',
    title: 'Model field',
    paths: '<path d="M4 5h16M4 9h9m-9 4h16m-16 4h10"/><circle cx="18" cy="9" r="1"/>',
  },
  {
    name: 'relation',
    title: 'Model relation',
    paths:
      '<circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="m7.4 11 9.2-4m-9.2 6 9.2 4"/>',
  },
  {
    name: 'activity',
    title: 'Activity',
    paths: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2m-11-9 2-1.5m13 1.5-2-1.5"/>',
  },
  {
    name: 'attachment',
    title: 'Attachment',
    paths:
      '<path d="m8.5 12.5 6.8-6.8a3.2 3.2 0 0 1 4.5 4.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6"/><path d="m7.1 13.9 7.8-7.8"/>',
  },
  {
    name: 'notification',
    title: 'Notification',
    paths:
      '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 12h4"/><path d="M12 3V1.8"/>',
  },
  {
    name: 'jobs',
    title: 'Background jobs',
    paths:
      '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M9 4V2.5h6V4m-7 5h8m-8 4h8m-8 4h4"/>',
  },
  {
    name: 'workflow',
    title: 'Workflow',
    paths:
      '<rect x="3.5" y="3.5" width="6" height="5" rx="1"/><rect x="14.5" y="15.5" width="6" height="5" rx="1"/><circle cx="17.5" cy="6" r="2.5"/><path d="M9.5 6h3.5a4.5 4.5 0 0 1 4.5 4.5v5m-14-7v4.5a3.5 3.5 0 0 0 3.5 3.5h7.5"/>',
  },
  {
    name: 'security',
    title: 'Security policy',
    paths:
      '<path d="M12 3 20 6v5.5c0 4.6-3 7.6-8 9.5-5-1.9-8-4.9-8-9.5V6l8-3Z"/><path d="m8.5 12 2.3 2.3 4.8-5"/>',
  },
  {
    name: 'search',
    title: 'Search',
    paths: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  },
  {
    name: 'add',
    title: 'Add',
    paths: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v10m-5-5h10"/>',
  },
  {
    name: 'edit',
    title: 'Edit',
    paths:
      '<path d="m14.5 5.5 4 4M4 20l4.5-1 10.8-10.8a2.8 2.8 0 0 0-4-4L4.5 15 4 20Z"/><path d="M13 20h7"/>',
  },
  {
    name: 'delete',
    title: 'Delete',
    paths: '<path d="M4 7h16m-10-3h4m-8 3 1 13h10l1-13m-8 3v7m4-7v7"/>',
  },
  {
    name: 'settings',
    title: 'Settings',
    paths:
      '<path d="M12 3.5v2m0 13v2m8.5-8.5h-2m-13 0h-2m14.5-6-1.4 1.4m-9.2 9.2L6 18m12 0-1.4-1.4m-9.2-9.2L6 6"/><circle cx="12" cy="12" r="6.3"/><circle cx="12" cy="12" r="2"/>',
  },
  {
    name: 'calendar',
    title: 'Calendar',
    paths:
      '<rect x="3.5" y="5" width="17" height="16" rx="1.5"/><path d="M7.5 3v4m9-4v4m-13 2h17m-12 4h.1m4.9 0h.1m-5.1 4h.1m4.9 0h.1"/>',
  },
  {
    name: 'filter',
    title: 'Filter',
    paths: '<path d="M3.5 5h17l-6.5 7v5l-4 2v-7L3.5 5Z"/>',
  },
  {
    name: 'refresh',
    title: 'Refresh',
    paths:
      '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9a7 7 0 0 1 12-2L20 12M4 12l2.5 5a7 7 0 0 0 12-2"/>',
  },
  {
    name: 'external-link',
    title: 'Open external link',
    paths:
      '<path d="M13 4h7v7m0-7-9 9"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/>',
  },
  {
    name: 'menu',
    title: 'Menu',
    paths: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  },
];

const textStyle = (color, size) =>
  `fill="${color}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="700" letter-spacing="1.4"`;

const generated = [];
for (const [variant, palette] of Object.entries(palettes)) {
  const symbolName = `moonwitness-symbol-${variant}.svg`;
  const wordmarkName = `moonwitness-wordmark-${variant}.svg`;
  const lockupName = `moonwitness-lockup-${variant}.svg`;

  generated.push({
    path: `brand/${symbolName}`,
    kind: 'symbol',
    variant,
    width: 64,
    height: 64,
    svg: svgDocument('0 0 64 64', 'MoonWitness lunar orbit symbol', mark(palette), 64, 64),
  });
  generated.push({
    path: `brand/${wordmarkName}`,
    kind: 'wordmark',
    variant,
    width: 440,
    height: 80,
    svg: svgDocument(
      '0 0 440 80',
      'MoonWitness wordmark',
      `<text x="4" y="58" ${textStyle(palette.ink, 48)}>MOONWITNESS</text>`,
      440,
      80
    ),
  });
  generated.push({
    path: `brand/${lockupName}`,
    kind: 'lockup',
    variant,
    width: 500,
    height: 80,
    svg: svgDocument(
      '0 0 500 80',
      'MoonWitness symbol and wordmark lockup',
      `<g transform="translate(4 8) scale(1)">${mark(palette)}</g><text x="78" y="57" ${textStyle(palette.ink, 42)}>MOONWITNESS</text>`,
      500,
      80
    ),
  });
}

const favicon = svgDocument(
  '0 0 64 64',
  'MoonWitness favicon',
  `<rect width="64" height="64" rx="12" fill="#0d0d0d"/><g transform="translate(0 0)">${mark({ ink: '#fffdf6', paper: '#0d0d0d', accent: '#e6ff00' })}</g>`,
  64,
  64
);
generated.push({
  path: 'brand/favicon.svg',
  kind: 'favicon',
  variant: 'dark-surface',
  width: 64,
  height: 64,
  svg: favicon,
});

const light = palettes.light;
const socialCard = svgDocument(
  '0 0 1200 630',
  'MoonWitness — one board for every model',
  `<rect width="1200" height="630" fill="${light.paper}"/>
  <circle cx="1040" cy="312" r="228" fill="none" stroke="#0d0d0d" stroke-width="2" opacity=".16"/>
  <circle cx="1040" cy="312" r="176" fill="none" stroke="#0d0d0d" stroke-width="1.5" opacity=".12"/>
  <path d="M800 455c96-134 219-203 361-213M824 500c115-66 242-84 343-47" fill="none" stroke="#0d0d0d" stroke-width="2" opacity=".12"/>
  <g transform="translate(72 58) scale(.72)">${mark(light)}</g>
  <text x="132" y="105" ${textStyle(light.ink, 29)}>MOONWITNESS</text>
  <rect x="74" y="194" width="580" height="104" rx="4" fill="${light.accent}" transform="rotate(-1.2 74 194)"/>
  <text x="92" y="270" fill="${light.ink}" font-family="Arial Black, Arial, sans-serif" font-size="76" font-weight="900" letter-spacing="-2">ONE BOARD.</text>
  <text x="78" y="375" fill="${light.ink}" font-family="Arial Black, Arial, sans-serif" font-size="75" font-weight="900" letter-spacing="-2">EVERY MODEL.</text>
  <path d="M82 407h520" stroke="#ff2e88" stroke-width="6" stroke-linecap="round"/>
  <text x="82" y="464" fill="#3a3a36" font-family="Arial, Helvetica, sans-serif" font-size="27">A clear view of the records behind your work.</text>
  <text x="82" y="555" fill="#6b695f" font-family="Arial, Helvetica, sans-serif" font-size="19" letter-spacing="2">OPEN-SOURCE · EXTENSIBLE · SELF-HOSTED</text>
  <circle cx="1070" cy="118" r="8" fill="${light.accent}" stroke="#0d0d0d" stroke-width="2"/>
  <path d="M976 524l10 10m0-10-10 10m50-42v16m-8-8h16" fill="none" stroke="#0d0d0d" stroke-width="2" stroke-linecap="round"/>`,
  1200,
  630
);
generated.push({
  path: 'brand/social-card.svg',
  kind: 'social-card',
  variant: 'light',
  width: 1200,
  height: 630,
  svg: socialCard,
});

const readmeBanner = svgDocument(
  '0 0 1280 320',
  'MoonWitness — every model, every record, one board',
  `<rect width="1280" height="320" fill="${light.paper}"/>
  <path d="M0 252C232 186 365 295 601 221S1007 121 1280 201" fill="none" stroke="#0d0d0d" stroke-width="2" opacity=".12"/>
  <path d="M0 278C256 214 421 319 640 257S1032 157 1280 228" fill="none" stroke="#0d0d0d" stroke-width="1.5" opacity=".1"/>
  <g transform="translate(76 92)">${mark(light)}</g>
  <text x="154" y="142" ${textStyle(light.ink, 42)}>MOONWITNESS</text>
  <rect x="78" y="186" width="500" height="64" rx="3" fill="${light.accent}" transform="rotate(-.7 78 186)"/>
  <text x="92" y="232" fill="${light.ink}" font-family="Arial Black, Arial, sans-serif" font-size="37" font-weight="900">EVERY MODEL. ONE BOARD.</text>
  <text x="820" y="116" fill="#3a3a36" font-family="Arial, Helvetica, sans-serif" font-size="22">Composable business software</text>
  <text x="820" y="153" fill="#3a3a36" font-family="Arial, Helvetica, sans-serif" font-size="22">with a programmatic addon core.</text>
  <circle cx="1080" cy="230" r="56" fill="none" stroke="#0d0d0d" stroke-width="2" opacity=".3"/>
  <circle cx="1080" cy="230" r="38" fill="none" stroke="#0d0d0d" stroke-width="2" opacity=".2"/>
  <circle cx="1115" cy="196" r="7" fill="${light.accent}" stroke="#0d0d0d" stroke-width="2"/>`,
  1280,
  320
);
generated.push({
  path: 'brand/readme-banner.svg',
  kind: 'readme-banner',
  variant: 'light',
  width: 1280,
  height: 320,
  svg: readmeBanner,
});

for (const icon of icons) {
  generated.push({
    path: `icons/${icon.name}.svg`,
    kind: 'icon',
    variant: 'currentColor',
    width: 24,
    height: 24,
    svg: svgDocument(
      '0 0 24 24',
      icon.title,
      icon.paths,
      24,
      24,
      ' fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'
    ),
  });
}

await mkdir(brandDirectory, { recursive: true });
for (const asset of generated) {
  const optimizedSvg = `${asset.svg.replace(/>\s+</gu, '><').trim()}\n`;
  await mkdir(dirname(resolve(packageRoot, asset.path)), { recursive: true });
  await writeFile(resolve(packageRoot, asset.path), optimizedSvg, 'utf8');
}

const manifest = {
  name: '@moonwitness/assets',
  schemaVersion: 1,
  source: 'scripts/generate.mjs',
  licenseManifest: 'licenses.json',
  assets: [
    ...generated.map(({ path, kind, variant, width, height }) => ({
      path,
      kind,
      variant,
      format: 'svg',
      width,
      height,
    })),
    {
      path: 'brand/social-card.png',
      source: 'brand/social-card.svg',
      kind: 'social-card',
      variant: 'light',
      format: 'png',
      width: 1200,
      height: 630,
    },
  ],
};
await writeFile(resolve(packageRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
stdout.write(`Generated ${generated.length} MoonWitness SVG assets and manifest.\n`);
