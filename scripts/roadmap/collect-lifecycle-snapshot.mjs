const requiredCheckNames = ['ci-gate'];
const fullShaPattern = /^[a-f0-9]{40}$/u;
const sourceLinePattern =
  /^\s*[-*]\s*(?:Source(?: code)? SHA|Source and final test SHA|Source commit pushed|Implementation commit|Local source SHA for test changes|Current source head(?: at evidence capture)?)\s*:\s*[^\r\n]*?\b([a-f0-9]{40})\b[^\r\n]*$/gimu;
const versionPattern =
  /^v?(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?$/u;

/**
 * Flatten the `--paginate --slurp` response shape returned by `gh api`.
 * @param {unknown} pages
 * @param {string | undefined} property
 * @returns {unknown[]}
 */
export function flattenGitHubPages(pages, property) {
  if (!Array.isArray(pages)) throw new Error('GitHub API pagination returned an invalid response.');
  return pages.flatMap((page) => {
    const values = property ? page?.[property] : page;
    if (!Array.isArray(values)) throw new Error('GitHub API pagination page has an invalid shape.');
    return values;
  });
}

/** @param {string} markdown */
export function parseEvidenceSourceSha(markdown) {
  const matches = [...markdown.matchAll(sourceLinePattern)].map((match) => match[1]);
  return matches.findLast((sha) => fullShaPattern.test(sha));
}

/** @param {string} markdown @param {Array<{id:string,status?:string}>} tasks */
export function parseRoadmapTaskStates(markdown, tasks) {
  const states = new Map();
  for (const [index, line] of markdown.split(/\r?\n/u).entries()) {
    const match = /^\s*-\s*\[([ xX])\]\s+(M(?:0|[1-9][0-9]*)\.[0-9]{2})\b/u.exec(line);
    if (!match) continue;
    const [, checkedMarker, taskId] = match;
    const found = states.get(taskId) ?? [];
    const evidencePath = /\((docs\/(?:roadmap\/evidence|decisions)\/[^)#]+\.md)\)/u.exec(line)?.[1];
    found.push({
      checked: checkedMarker.toLowerCase() === 'x',
      line: index + 1,
      evidencePath,
    });
    states.set(taskId, found);
  }
  const taskIds = new Set(tasks.map(({ id }) => id));
  for (const taskId of states.keys()) {
    if (!taskIds.has(taskId)) throw new Error(`Master roadmap has an unindexed task ${taskId}.`);
  }
  return new Map(
    tasks.map((task) => {
      const entries = states.get(task.id) ?? [];
      if (entries.length !== 1)
        throw new Error(`${task.id} must have exactly one master roadmap checkbox.`);
      const status = task.status ?? (entries[0].checked ? 'complete' : 'todo');
      if (entries[0].checked && status !== 'complete')
        throw new Error(`${task.id} is checked complete but task status is ${status}.`);
      if (!entries[0].checked && status === 'complete')
        throw new Error(`${task.id} status is complete but its master checkbox is open.`);
      return [
        task.id,
        {
          status,
          acceptanceVerified: entries[0].checked && status === 'complete',
          ...(entries[0].evidencePath ? { evidencePath: entries[0].evidencePath } : {}),
        },
      ];
    })
  );
}

function latestRequiredChecks(checkRuns, headSha) {
  const latestByName = new Map();
  for (const run of checkRuns) {
    if (!requiredCheckNames.includes(run.name) || run.head_sha !== headSha) continue;
    const current = latestByName.get(run.name);
    if (!current || Number(run.id) > Number(current.id)) latestByName.set(run.name, run);
  }
  return [...latestByName.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(({ name, head_sha, status, conclusion }) => ({
      name,
      headSha: head_sha,
      status,
      conclusion: conclusion ?? null,
    }));
}

/**
 * Assemble a versioned read-only snapshot from checked-in roadmap/evidence plus trusted facts.
 * @param {{tasks:Array<{id:string,dependsOn:string[],status?:string,evidence?:string}>,roadmap:string,readEvidence:(path:string)=>Promise<string>,repositoryId:string,sourceSha:string,branchHeads:{dev:string,main:string},checkRuns:Array<{id:number,name:string,head_sha:string,status:'queued'|'in_progress'|'completed',conclusion:string|null}>,releases:Array<{tag_name:string,draft:boolean,prerelease:boolean,published_at?:string|null,created_at?:string|null}>,resolveReleaseCommit:(tag:string)=>string|undefined,commitExists:(sha:string)=>boolean,isAncestor:(sourceSha:string,branchHeadSha:string)=>boolean,generatedAt?:string}} input
 */
export async function collectLifecycleSnapshot(input) {
  if (!/^[1-9][0-9]*$/u.test(input.repositoryId))
    throw new Error('Repository ID must be a positive decimal string.');
  if (!fullShaPattern.test(input.sourceSha)) throw new Error('Snapshot source SHA is malformed.');
  if (!fullShaPattern.test(input.branchHeads.dev) || !fullShaPattern.test(input.branchHeads.main))
    throw new Error('Both branch heads must be full lowercase Git SHAs.');

  const taskStates = parseRoadmapTaskStates(input.roadmap, input.tasks);
  const candidates = input.releases
    .filter((release) => !release.draft && versionPattern.test(release.tag_name))
    .sort(
      (left, right) =>
        Date.parse(right.published_at ?? right.created_at ?? '') -
        Date.parse(left.published_at ?? left.created_at ?? '')
    );
  let releaseManifest;
  for (const release of candidates) {
    const releaseSha = input.resolveReleaseCommit(release.tag_name);
    if (!releaseSha || !fullShaPattern.test(releaseSha)) continue;
    releaseManifest = { version: release.tag_name, sourceSha: releaseSha };
    break;
  }

  const records = [];
  for (const task of input.tasks) {
    const state = taskStates.get(task.id);
    const evidencePath =
      task.evidence ?? state.evidencePath ?? `docs/roadmap/evidence/${task.id}.md`;
    const markdown = await input.readEvidence(evidencePath);
    if (state.acceptanceVerified && !markdown.trim())
      throw new Error(`Accepted task ${task.id} has no readable evidence content.`);
    const sourceSha = parseEvidenceSourceSha(markdown);
    const knownSource = sourceSha && input.commitExists(sourceSha) ? sourceSha : undefined;
    const sourceInMain = knownSource && input.isAncestor(knownSource, input.branchHeads.main);
    const sourceInDev = knownSource && input.isAncestor(knownSource, input.branchHeads.dev);
    records.push({
      taskId: task.id,
      status: state.status,
      acceptanceVerified: state.acceptanceVerified,
      ...(state.acceptanceVerified ? { evidenceSha: input.sourceSha } : {}),
      ...(knownSource ? { sourceSha: knownSource } : {}),
      ...(knownSource ? { sourceInDev } : {}),
      ...(knownSource ? { sourceInMain } : {}),
      ...(state.acceptanceVerified
        ? { requiredChecks: latestRequiredChecks(input.checkRuns, input.branchHeads.dev) }
        : {}),
      ...(releaseManifest && sourceInMain ? { releaseManifest } : {}),
      ...(releaseManifest && sourceInMain && knownSource
        ? {
            releaseContainsSource: input.isAncestor(knownSource, releaseManifest.sourceSha),
          }
        : {}),
    });
  }

  return {
    schemaVersion: 1,
    repositoryId: input.repositoryId,
    sourceSha: input.sourceSha,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    branchHeads: input.branchHeads,
    tasks: records,
  };
}
