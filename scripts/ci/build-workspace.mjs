import { spawnSync } from 'node:child_process';
import process from 'node:process';
import {
  findFailedWorkspacePackage,
  renderWorkspaceBuildFailure,
  summarizeWorkspaceBuildDiagnostics,
} from './workspace-build-diagnostics.mjs';

const packageManagerCli = process.env.npm_execpath;
const buildFilter = process.argv[2];
if (!packageManagerCli) {
  process.stderr.write(
    'Run the workspace build through pnpm so the package manager can be resolved safely.\n'
  );
  process.exit(2);
}
if (buildFilter && buildFilter !== '@moonwitness/api...') {
  process.stderr.write('Workspace build filter is not allowlisted.\n');
  process.exit(2);
}

const buildArgs = buildFilter ? ['--filter', buildFilter, 'build'] : ['-r', 'build'];
const result = spawnSync(process.execPath, [packageManagerCli, ...buildArgs], {
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024,
});
const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

if (result.status === 0) {
  process.stdout.write(output);
  process.exit(0);
}

process.stdout.write(output);
const diagnostics = summarizeWorkspaceBuildDiagnostics(output);
const failure = renderWorkspaceBuildFailure(output, result.status ?? 1);
if (process.env.GITHUB_STEP_SUMMARY) {
  const summary = [
    '## Workspace build failure diagnostics',
    '',
    `- Failed package: ${failure.failedPackage ?? 'unknown package'}`,
    `- Exit code: ${failure.exitCode}`,
    ...(diagnostics.length > 0
      ? diagnostics.map(
          (item) => `- TypeScript: \`${item.path}:${item.line}:${item.column}\` — ${item.code}`
        )
      : ['- No allowlisted TypeScript location could be extracted from this build output.']),
    '',
  ].join('\n');
  process.stdout.write(summary);
  const { appendFile } = await import('node:fs/promises');
  await appendFile(process.env.GITHUB_STEP_SUMMARY, summary, 'utf8');
}
if (diagnostics.length > 0) {
  for (const diagnostic of diagnostics) {
    process.stdout.write(
      `::error file=${diagnostic.path},line=${diagnostic.line},col=${diagnostic.column},title=Workspace build ${diagnostic.code}::See compiler details in the runner log.\n`
    );
  }
} else {
  const packageName = findFailedWorkspacePackage(output);
  const subject = packageName ? ` for ${packageName}` : '';
  process.stdout.write(
    `::error title=Workspace build failed::Recursive build${subject} exited ${result.status ?? 1}; see the runner log.\n`
  );
}

process.exit(result.status ?? 1);
