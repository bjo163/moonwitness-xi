import { gzipSync } from 'node:zlib';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetDirectory = path.join(root, 'apps/ui-catalog/dist/assets');
const budgetPath = path.join(root, 'apps/ui-catalog/bundle-budget.json');

export function summarizeBundleGroup(name, files, limits) {
  if (files.length === 0) throw new Error(`No ${name} bundle files were found.`);
  const rawBytes = files.reduce((total, file) => total + file.contents.byteLength, 0);
  const gzipBytes = files.reduce((total, file) => total + gzipSync(file.contents).byteLength, 0);
  const rawPass = rawBytes <= limits.maxRawBytes;
  const gzipPass = gzipBytes <= limits.maxGzipBytes;
  return {
    name,
    files: files.map(({ name: fileName }) => fileName).sort(),
    rawBytes,
    gzipBytes,
    maxRawBytes: limits.maxRawBytes,
    maxGzipBytes: limits.maxGzipBytes,
    passed: rawPass && gzipPass,
  };
}

export function renderBundleSummary(groups) {
  const lines = [
    '## UI catalog bundle budget',
    '',
    '| Asset | Raw | Budget | Gzip | Budget | Result |',
    '| --- | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const group of groups) {
    lines.push(
      `| ${group.name} | ${group.rawBytes} B | ${group.maxRawBytes} B | ${group.gzipBytes} B | ${group.maxGzipBytes} B | ${group.passed ? 'pass' : 'over budget'} |`
    );
  }
  return `${lines.join('\n')}\n`;
}

async function loadBudget() {
  const value = JSON.parse(await readFile(budgetPath, 'utf8'));
  if (
    typeof value !== 'object' ||
    value === null ||
    value.schemaVersion !== 1 ||
    typeof value.javascript !== 'object' ||
    value.javascript === null ||
    typeof value.stylesheet !== 'object' ||
    value.stylesheet === null
  ) {
    throw new Error('UI catalog bundle budget must use the supported schemaVersion 1 shape.');
  }
  for (const [name, limits] of Object.entries({
    javascript: value.javascript,
    stylesheet: value.stylesheet,
  })) {
    if (
      typeof limits.maxRawBytes !== 'number' ||
      typeof limits.maxGzipBytes !== 'number' ||
      !Number.isSafeInteger(limits.maxRawBytes) ||
      !Number.isSafeInteger(limits.maxGzipBytes) ||
      limits.maxRawBytes <= 0 ||
      limits.maxGzipBytes <= 0
    ) {
      throw new Error(`UI catalog ${name} budget limits must be positive safe integers.`);
    }
  }
  return value;
}

export async function checkUiCatalogBudget() {
  const budget = await loadBudget();
  const names = (await readdir(assetDirectory)).filter((name) => /\.(?:js|css)$/u.test(name));
  const javascriptFiles = [];
  const stylesheetFiles = [];
  for (const name of names.sort()) {
    const file = { name, contents: await readFile(path.join(assetDirectory, name)) };
    if (name.endsWith('.js')) javascriptFiles.push(file);
    if (name.endsWith('.css')) stylesheetFiles.push(file);
  }
  const summary = [
    summarizeBundleGroup('JavaScript', javascriptFiles, budget.javascript),
    summarizeBundleGroup('Stylesheet', stylesheetFiles, budget.stylesheet),
  ];
  const report = renderBundleSummary(summary);
  process.stdout.write(report);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFile } = await import('node:fs/promises');
    await appendFile(process.env.GITHUB_STEP_SUMMARY, report);
  }
  if (summary.some((group) => !group.passed)) {
    throw new Error('UI catalog assets exceed their reviewed raw or gzip bundle budget.');
  }
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await checkUiCatalogBudget();
}
