import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

function runGit(args, options = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

export function pushExpectedRef(remote, sourceRef, targetRef, expectedTargetSha) {
  if (!remote || !sourceRef || !targetRef || !expectedTargetSha) {
    throw new Error(
      'Usage: push-expected-ref <remote> <source-ref> <target-ref> <expected-target-sha>'
    );
  }
  if (!/^refs\/(heads|tags)\/[A-Za-z0-9._/-]+$/.test(targetRef)) {
    throw new Error(`Target must be a fully qualified branch or tag ref: ${targetRef}`);
  }
  if (!/^[0-9a-f]{40,64}$/i.test(expectedTargetSha)) {
    throw new Error('Expected target SHA must be a full hexadecimal object ID.');
  }
  runGit(['check-ref-format', targetRef]);

  const remoteRefs = runGit(['ls-remote', '--refs', remote, targetRef]);
  const observedTargetSha = remoteRefs.trim().split(/\s+/)[0] ?? '';
  if (observedTargetSha !== expectedTargetSha) {
    throw new Error(
      `Refusing stale write: ${targetRef} expected ${expectedTargetSha}, remote is ${observedTargetSha || '(missing)'}.`
    );
  }

  try {
    const output = runGit(['push', remote, `${sourceRef}:${targetRef}`]);
    return { targetRef, expectedTargetSha, output: output.trim() };
  } catch (error) {
    throw new Error(
      `Push rejected for ${targetRef}; remote changes were preserved. Recompute from the current remote head.`,
      { cause: error }
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const [, , remote, sourceRef, targetRef, expectedSha] = process.argv;
    const result = pushExpectedRef(remote, sourceRef, targetRef, expectedSha);
    process.stdout.write(
      `Pushed ${result.targetRef} from ${sourceRef} after verifying expected remote SHA ${result.expectedTargetSha}.\n`
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
