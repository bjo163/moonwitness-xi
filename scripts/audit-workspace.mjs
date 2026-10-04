import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const root = process.cwd();
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const excludedDirectories = new Set([
  '.git',
  '.next',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
]);
const workspacePatterns = ['apps/*', 'packages/*'];

async function listDirectories(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(directory, entry.name));
}

async function findPackageFiles(directory) {
  const result = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name))
        result.push(...(await findPackageFiles(path.join(directory, entry.name))));
      continue;
    }
    if (sourceExtensions.has(path.extname(entry.name)))
      result.push(path.join(directory, entry.name));
  }
  return result;
}

function moduleSpecifiers(sourceFile) {
  const specifiers = [];
  function visit(node) {
    if (
      ts.isImportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const clause = node.importClause;
      const namedImports =
        clause?.namedBindings && ts.isNamedImports(clause.namedBindings)
          ? clause.namedBindings.elements
          : [];
      const hasRuntimeImport = Boolean(
        !clause ||
        (!clause.isTypeOnly &&
          (clause.name ||
            !namedImports.length ||
            namedImports.some((element) => !element.isTypeOnly)))
      );
      specifiers.push({ value: node.moduleSpecifier.text, typeOnly: !hasRuntimeImport });
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push({ value: node.moduleSpecifier.text, typeOnly: node.isTypeOnly });
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if (isDynamicImport || isRequire)
        specifiers.push({ value: node.arguments[0].text, typeOnly: false });
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return specifiers;
}

function resolveSourceImport(importer, specifier, compilerOptions) {
  const resolved = ts.resolveModuleName(specifier, importer, compilerOptions, ts.sys).resolvedModule
    ?.resolvedFileName;
  return resolved ? path.resolve(resolved) : undefined;
}

function findCycles(graph) {
  const active = [];
  const activeSet = new Set();
  const completed = new Set();
  const cycles = new Set();
  function visit(node) {
    if (activeSet.has(node)) {
      const start = active.indexOf(node);
      const cycle = [...active.slice(start), node].map((file) =>
        path.relative(root, file).split(path.sep).join('/')
      );
      const canonical = cycle.slice(0, -1).sort().join(' -> ');
      cycles.add(canonical);
      return;
    }
    if (completed.has(node)) return;
    active.push(node);
    activeSet.add(node);
    for (const dependency of graph.get(node) ?? []) visit(dependency);
    active.pop();
    activeSet.delete(node);
    completed.add(node);
  }
  for (const node of graph.keys()) visit(node);
  return [...cycles].sort();
}

const packageDirectories = (
  await Promise.all(
    workspacePatterns.map((pattern) => listDirectories(path.join(root, pattern.split('/')[0])))
  )
).flat();
const workspaces = [];
for (const directory of packageDirectories) {
  try {
    const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
    workspaces.push({ directory, manifest });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}
const rootManifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const allPackages = [{ directory: root, manifest: rootManifest }, ...workspaces];
const packageByName = new Map(
  allPackages.filter(({ manifest }) => manifest.name).map((item) => [item.manifest.name, item])
);
const sourceFiles = new Set(
  (await Promise.all(allPackages.map(({ directory }) => findPackageFiles(directory)))).flat()
);
const localGraph = new Map();
const runtimeGraph = new Map();
const packageGraph = new Map(allPackages.map(({ manifest }) => [manifest.name, new Set()]));
const packageUsage = new Map(allPackages.map(({ manifest }) => [manifest.name, new Map()]));
const sourceWorkspace = new Map();
const compilerOptionsByPackage = new Map();
for (const item of allPackages) {
  const configPath = path.join(item.directory, 'tsconfig.json');
  try {
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    if (!configFile.error) {
      compilerOptionsByPackage.set(
        item.manifest.name,
        ts.parseJsonConfigFileContent(configFile.config, ts.sys, item.directory).options
      );
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  for (const file of sourceFiles) {
    if (file === item.directory || file.startsWith(`${item.directory}${path.sep}`))
      sourceWorkspace.set(file, item);
  }
}

for (const file of sourceFiles) {
  const sourceFile = ts.createSourceFile(
    file,
    await readFile(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  const owner = sourceWorkspace.get(file);
  localGraph.set(file, new Set());
  runtimeGraph.set(file, new Set());
  for (const { value: specifier, typeOnly } of moduleSpecifiers(sourceFile)) {
    const resolved = resolveSourceImport(
      file,
      specifier,
      compilerOptionsByPackage.get(owner?.manifest.name) ?? {}
    );
    if (resolved && sourceFiles.has(resolved)) {
      localGraph.get(file).add(resolved);
      if (!typeOnly) runtimeGraph.get(file).add(resolved);
    }
    const dependencyName = [...packageByName.keys()]
      .sort((a, b) => b.length - a.length)
      .find((name) => specifier === name || specifier.startsWith(`${name}/`));
    if (dependencyName && owner && dependencyName !== owner.manifest.name) {
      const counts = packageUsage.get(owner.manifest.name);
      counts.set(dependencyName, (counts.get(dependencyName) ?? 0) + 1);
      packageGraph.get(owner.manifest.name)?.add(dependencyName);
    }
    if (owner && !packageByName.has(dependencyName)) {
      const dependencyRoot = specifier.startsWith('@')
        ? specifier.split('/').slice(0, 2).join('/')
        : specifier.split('/')[0];
      const declared = [
        owner.manifest.dependencies,
        owner.manifest.devDependencies,
        owner.manifest.optionalDependencies,
        owner.manifest.peerDependencies,
      ].some((section) => section && dependencyRoot in section);
      if (declared) {
        const counts = packageUsage.get(owner.manifest.name);
        counts.set(dependencyRoot, (counts.get(dependencyRoot) ?? 0) + 1);
      }
    }
  }
}

const unusedCandidates = [];
for (const item of allPackages) {
  const name = item.manifest.name ?? '(root)';
  const usage = packageUsage.get(name) ?? new Map();
  const dependencySections = [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ];
  for (const sectionName of dependencySections) {
    const section = item.manifest[sectionName] ?? {};
    for (const dependency of Object.keys(section)) {
      if (!usage.has(dependency) && !packageByName.has(dependency))
        unusedCandidates.push(`${name}: ${sectionName}.${dependency}`);
    }
  }
  for (const [dependency, version] of Object.entries(item.manifest.dependencies ?? {})) {
    if (String(version).startsWith('workspace:') && dependency !== name)
      packageGraph.get(name)?.add(dependency);
  }
}

const cycles = findCycles(localGraph);
const runtimeCycles = findCycles(runtimeGraph);
const packageCycles = findCycles(
  new Map(
    [...packageGraph].map(([name, dependencies]) => [
      name,
      new Set([...dependencies].filter((dependency) => packageGraph.has(dependency))),
    ])
  )
);
const result = {
  packages: allPackages
    .map(({ manifest }) => manifest.name)
    .filter(Boolean)
    .sort(),
  sourceFileCount: sourceFiles.size,
  localImportCycles: cycles,
  runtimeImportCycles: runtimeCycles,
  workspaceDependencyCycles: packageCycles,
  unusedDependencyCandidates: unusedCandidates.sort(),
  note: 'Unused dependency results are candidates: package scripts, config conventions, generated code, and runtime-loaded modules require manual review.',
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
