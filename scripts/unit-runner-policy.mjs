const checks = [
  {
    name: 'Versioned documentation',
    args: ['run', 'test:versioned-docs'],
    ciOwner: 'automation',
  },
  {
    name: 'brand asset contracts',
    args: ['run', 'test:assets'],
    ciOwner: 'ui',
  },
  {
    name: 'shared UI token contracts',
    args: ['run', 'test:ui'],
    ciOwner: 'ui',
  },
];

export function getUnitRunnerCheckPlan({ githubActions }) {
  return checks.map((check) => ({
    ...check,
    runInUnitRunner: !githubActions || check.ciOwner === undefined,
  }));
}
