import path from 'node:path';

export function summarizeTypeScriptDiagnostics(output, repositoryRoot, packageRoot) {
  const diagnosticPattern = /^(.+?)\((\d+),(\d+)\): error (TS\d+):/gmu;
  return [...output.matchAll(diagnosticPattern)].map((match) => {
    const sourcePath = path.win32.isAbsolute(repositoryRoot)
      ? path.win32.relative(
          repositoryRoot,
          path.win32.isAbsolute(match[1]) ? match[1] : path.win32.resolve(packageRoot, match[1])
        )
      : path.isAbsolute(match[1])
        ? path.relative(repositoryRoot, match[1])
        : path.relative(repositoryRoot, path.resolve(packageRoot, match[1]));
    const normalizedPath = sourcePath.split(/[\\/]/u).join('/');

    return {
      path: normalizedPath.startsWith('../') ? undefined : normalizedPath,
      line: Number(match[2]),
      column: Number(match[3]),
      code: match[4],
    };
  });
}
