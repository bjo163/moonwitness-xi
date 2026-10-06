export function summarizeWorkspaceBuildDiagnostics(output) {
  const typescriptPattern =
    /^(apps|packages)\/([a-z0-9-]+) build: (.+?)\((\d+),(\d+)\): error (TS\d+):/gmu;
  return [...output.matchAll(typescriptPattern)].map((match) => ({
    path: `${match[1]}/${match[2]}/${match[3].replaceAll('\\', '/')}`,
    line: Number(match[4]),
    column: Number(match[5]),
    code: match[6],
  }));
}

export function findFailedWorkspacePackage(output) {
  const match = output.match(
    /ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL[^\n]*?\s(@moonwitness\/[a-z0-9-]+)@[^\s]+ build:/u
  );
  return match?.[1];
}
