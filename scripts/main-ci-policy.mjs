export function selectMainPushCiRun(workflowRuns, sourceSha) {
  return workflowRuns
    .filter(
      (run) => run.head_sha === sourceSha && run.head_branch === 'main' && run.event === 'push'
    )
    .sort((left, right) => {
      const dateOrder = Date.parse(left.created_at) - Date.parse(right.created_at);
      return dateOrder || Number(left.run_attempt) - Number(right.run_attempt);
    })
    .at(-1);
}

export function verifyMainPushCiGate(run, jobs, sourceSha) {
  if (!run || run.head_sha !== sourceSha || run.head_branch !== 'main' || run.event !== 'push') {
    return { passed: false, reason: 'no exact main push CI run exists for this source SHA' };
  }
  if (run.status !== 'completed') {
    return { passed: false, pending: true, reason: `CI run status is ${run.status}` };
  }
  if (run.conclusion !== 'success') {
    return {
      passed: false,
      reason: `CI run concluded ${run.conclusion ?? 'without a conclusion'}`,
    };
  }
  const gate = jobs.find((job) => job.name === 'ci-gate');
  if (gate?.conclusion !== 'success') {
    return { passed: false, reason: 'main push CI run has no successful ci-gate job' };
  }
  return { passed: true, runId: run.id, runAttempt: run.run_attempt };
}
