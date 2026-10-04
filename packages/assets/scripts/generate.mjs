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

function svgDocument(viewBox, title, content, width, height) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}" role="img" aria-label="${title}">
  <title>${title}</title>
${content}
</svg>\n`;
}

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

await mkdir(brandDirectory, { recursive: true });
for (const asset of generated) {
  await writeFile(resolve(packageRoot, asset.path), asset.svg, 'utf8');
}

const manifest = {
  name: '@moonwitness/assets',
  schemaVersion: 1,
  source: 'scripts/generate.mjs',
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
