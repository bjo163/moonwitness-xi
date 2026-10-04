import { Buffer } from 'node:buffer';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(packageRoot, '../..');
const outputPath = resolve(repositoryRoot, 'docs/design/assets/icon-contact-sheet.png');
const manifest = JSON.parse(await readFile(resolve(packageRoot, 'manifest.json'), 'utf8'));
const icons = manifest.assets.filter((asset) => asset.kind === 'icon');

function dataUrl(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const previews = await Promise.all(
  icons.map(async (asset) => {
    const filename = asset.path.slice('icons/'.length);
    const svg = await readFile(resolve(packageRoot, asset.path), 'utf8');
    const light = dataUrl(svg.replaceAll('currentColor', '#0d0d0d'));
    const dark = dataUrl(svg.replaceAll('currentColor', '#f3efe4'));
    return { filename, light, dark };
  })
);

const iconCells = previews
  .map(
    ({ filename, light, dark }) => `<article>
      <h2>${filename}</h2>
      <div class="samples light">${[16, 20, 24, 32]
        .map(
          (size) =>
            `<div><img src="${light}" alt="" width="${size}" height="${size}"><span>${size}</span></div>`
        )
        .join('')}</div>
      <div class="samples dark">${[16, 20, 24, 32]
        .map(
          (size) =>
            `<div><img src="${dark}" alt="" width="${size}" height="${size}"><span>${size}</span></div>`
        )
        .join('')}</div>
    </article>`
  )
  .join('\n');

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1200 },
    deviceScaleFactor: 1,
  });
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;padding:24px;background:#e8e4d9;color:#0d0d0d;font:13px Arial,sans-serif}
    h1{margin:0 0 16px;font-size:22px}p{margin:0 0 18px;color:#3a3a36}
    main{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
    article{min-height:116px;padding:9px 10px;border:2px solid #0d0d0d;background:#fffdf6;box-shadow:3px 3px #0d0d0d}
    h2{overflow:hidden;margin:0 0 7px;font:700 12px ui-monospace,monospace;text-overflow:ellipsis;white-space:nowrap}
    .samples{display:flex;align-items:center;justify-content:space-between;padding:3px 5px}
    .samples div{display:flex;align-items:center;gap:3px;font:9px Arial,sans-serif}
    .samples img{display:block;object-fit:contain}.dark{background:#0e0e10;color:#f3efe4}
    </style></head><body><h1>MoonWitness UI icon inventory</h1>
    <p>Original 24×24 rounded-stroke symbols, rendered at 16 / 20 / 24 / 32 px on light and dark surfaces.</p>
    <main>${iconCells}</main></body></html>`);

  const imageStates = await page.locator('main img').evaluateAll((images) =>
    images.map((image) => ({
      loaded: image.complete && image.naturalWidth > 0,
      width: image.naturalWidth,
      height: image.naturalHeight,
    }))
  );
  if (imageStates.some(({ loaded }) => !loaded)) {
    throw new Error(
      `Icon contact sheet contains invalid SVG previews: ${JSON.stringify(imageStates)}`
    );
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await page.screenshot({ path: outputPath, fullPage: true, animations: 'disabled' });
  stdout.write(
    `Rendered ${icons.length} icons across ${imageStates.length} size/theme samples to ${outputPath}.\n`
  );
  await page.close();
} finally {
  await browser.close();
}
