import { gzipSync } from 'node:zlib';
import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'apps/board/dist');
const manifestPath = path.join(outputDirectory, '.vite/manifest.json');
const budgetPath = path.join(root, 'apps/board/bundle-budget.json');

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateBudget(value) {
  const keys = [
    'initialJavaScript',
    'initialStylesheet',
    'lazyRouteJavaScript',
    'lazyRouteStylesheet',
    'fullRouteJavaScript',
  ];
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error('Board bundle budget must use the supported schemaVersion 1 shape.');
  }
  for (const key of keys) {
    const limits = value[key];
    if (
      !isRecord(limits) ||
      !Number.isSafeInteger(limits.maxRawBytes) ||
      limits.maxRawBytes <= 0 ||
      !Number.isSafeInteger(limits.maxGzipBytes) ||
      limits.maxGzipBytes <= 0
    ) {
      throw new Error(`Board ${key} limits must be positive safe integers.`);
    }
  }
  return value;
}

function collectStaticImports(manifest, roots) {
  const visited = new Set();
  const visit = (key) => {
    if (visited.has(key)) return;
    const entry = manifest[key];
    if (!isRecord(entry) || typeof entry.file !== 'string') {
      throw new Error(`Board Vite manifest references missing or invalid entry '${key}'.`);
    }
    visited.add(key);
    if (entry.imports !== undefined && !Array.isArray(entry.imports)) {
      throw new Error(`Board Vite manifest has invalid static imports for '${key}'.`);
    }
    for (const dependency of entry.imports ?? []) {
      if (typeof dependency !== 'string') {
        throw new Error(`Board Vite manifest has a non-string import in '${key}'.`);
      }
      visit(dependency);
    }
  };
  roots.forEach(visit);
  return visited;
}

function collectReachableRouteModules(manifest, roots, stopAtDynamicImports) {
  const visited = new Set();
  const visit = (key) => {
    if (visited.has(key)) return;
    const entry = manifest[key];
    if (!isRecord(entry) || typeof entry.file !== 'string') {
      throw new Error(`Board Vite manifest references missing or invalid entry '${key}'.`);
    }
    visited.add(key);
    for (const field of ['imports', ...(stopAtDynamicImports.has(key) ? [] : ['dynamicImports'])]) {
      const dependencies = entry[field] ?? [];
      if (!Array.isArray(dependencies)) {
        throw new Error(`Board Vite manifest has invalid ${field} for '${key}'.`);
      }
      for (const dependency of dependencies) {
        if (typeof dependency !== 'string' || !manifest[dependency]) {
          throw new Error(`Board Vite manifest has an invalid ${field} reference from '${key}'.`);
        }
        visit(dependency);
      }
    }
  };
  roots.forEach(visit);
  return visited;
}

function assetNames(manifest, moduleKeys, extension) {
  const names = new Set();
  for (const key of moduleKeys) {
    const entry = manifest[key];
    if (entry.file.endsWith(extension)) names.add(entry.file);
    if (entry.css !== undefined && !Array.isArray(entry.css)) {
      throw new Error(`Board Vite manifest has invalid stylesheet list for '${key}'.`);
    }
    for (const asset of entry.css ?? []) {
      if (typeof asset !== 'string') {
        throw new Error(`Board Vite manifest has a non-string stylesheet in '${key}'.`);
      }
      if (asset.endsWith(extension)) names.add(asset);
    }
  }
  return [...names].sort();
}

function summarizeAssets(name, files, limits) {
  if (files.length === 0) {
    return {
      name,
      files,
      rawBytes: 0,
      gzipBytes: 0,
      maxRawBytes: limits.maxRawBytes,
      maxGzipBytes: limits.maxGzipBytes,
      passed: true,
    };
  }
  const rawBytes = files.reduce((total, file) => total + file.contents.byteLength, 0);
  const gzipBytes = files.reduce((total, file) => total + gzipSync(file.contents).byteLength, 0);
  return {
    name,
    files: files.map(({ name: fileName }) => fileName),
    rawBytes,
    gzipBytes,
    maxRawBytes: limits.maxRawBytes,
    maxGzipBytes: limits.maxGzipBytes,
    passed: rawBytes <= limits.maxRawBytes && gzipBytes <= limits.maxGzipBytes,
  };
}

async function readAssets(names, readAsset) {
  return Promise.all(names.map(async (name) => ({ name, contents: await readAsset(name) })));
}

export async function measureBoardBundle(manifest, readAsset, budget) {
  const limits = validateBudget(budget);
  const entryKey = manifest['index.html']
    ? 'index.html'
    : Object.keys(manifest).find((key) => manifest[key]?.isEntry === true);
  if (!entryKey) throw new Error('Board Vite manifest has no HTML entry or JavaScript entry.');
  const initialModules = collectStaticImports(manifest, [entryKey]);
  const initialJsNames = assetNames(manifest, initialModules, '.js');
  const initialCssNames = assetNames(manifest, initialModules, '.css');
  const initialJavascriptFiles = await readAssets(initialJsNames, readAsset);
  const initialStylesheetFiles = await readAssets(initialCssNames, readAsset);
  const summaries = [
    summarizeAssets('Initial JavaScript', initialJavascriptFiles, limits.initialJavaScript),
    summarizeAssets('Initial stylesheet', initialStylesheetFiles, limits.initialStylesheet),
  ];

  const lazyRoots = new Set();
  for (const key of initialModules) {
    const dynamicImports = manifest[key]?.dynamicImports ?? [];
    if (!Array.isArray(dynamicImports)) {
      throw new Error(`Board Vite manifest has invalid dynamic imports for '${key}'.`);
    }
    for (const dependency of dynamicImports) {
      if (typeof dependency !== 'string' || !manifest[dependency]) {
        throw new Error(`Board Vite manifest has an invalid lazy import from '${key}'.`);
      }
      lazyRoots.add(dependency);
    }
  }

  const lazyGroups = [];
  for (const key of [...lazyRoots].sort()) {
    const routeModules = collectStaticImports(manifest, [key]);
    const additionalModules = new Set(
      [...routeModules].filter((item) => !initialModules.has(item))
    );
    const chunk = manifest[key];
    const routeName = typeof chunk.name === 'string' ? chunk.name : key;
    const javascript = summarizeAssets(
      `${routeName} route JavaScript`,
      await readAssets(assetNames(manifest, additionalModules, '.js'), readAsset),
      limits.lazyRouteJavaScript
    );
    const stylesheet = summarizeAssets(
      `${routeName} route stylesheet`,
      await readAssets(assetNames(manifest, additionalModules, '.css'), readAsset),
      limits.lazyRouteStylesheet
    );
    const reachableModules = collectReachableRouteModules(manifest, [key], initialModules);
    const fullRouteModules = new Set([...initialModules, ...reachableModules]);
    const fullJavascriptFiles = await readAssets(
      assetNames(manifest, fullRouteModules, '.js'),
      readAsset
    );
    const fullJavascript = summarizeAssets(
      `${routeName} full JavaScript route`,
      fullJavascriptFiles,
      limits.fullRouteJavaScript
    );
    lazyGroups.push({ route: routeName, javascript, stylesheet, fullJavascript });
    summaries.push(javascript, stylesheet, fullJavascript);
  }
  return { summaries, lazyGroups };
}

export function renderBoardBundleSummary(report) {
  const lines = [
    '## Board route-aware bundle budget',
    '',
    '| Scope | Raw | Budget | Gzip | Budget | Result |',
    '| --- | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const group of report.summaries) {
    lines.push(
      `| ${group.name} | ${group.rawBytes} B | ${group.maxRawBytes} B | ${group.gzipBytes} B | ${group.maxGzipBytes} B | ${group.passed ? 'pass' : 'over budget'} |`
    );
  }
  return `${lines.join('\n')}\n`;
}

export async function checkBoardBundle() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const budget = JSON.parse(await readFile(budgetPath, 'utf8'));
  const report = await measureBoardBundle(
    manifest,
    (asset) => readFile(path.join(outputDirectory, asset)),
    budget
  );
  const summary = renderBoardBundleSummary(report);
  process.stdout.write(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  if (report.summaries.some((group) => !group.passed)) {
    throw new Error('Board initial or lazy-route assets exceed their raw or gzip budget.');
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await checkBoardBundle();
}
