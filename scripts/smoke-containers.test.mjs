import assert from 'node:assert/strict';
import test from 'node:test';
import { runContainerSmoke } from './smoke-containers.mjs';

function harness({ request } = {}) {
  const calls = [];
  const outputs = [];
  const options = [];
  const execute = (args, settings) => {
    calls.push(args);
    options.push(settings);
    return args.includes('logs') ? 'Graceful shutdown complete' : '';
  };
  let port = 41000;
  return {
    calls,
    outputs,
    options,
    run: (overrides = {}) =>
      runContainerSmoke({
        root: 'X:/fixture',
        environment: { EXISTING_ENV: 'preserved' },
        execute,
        request:
          request ??
          (async () => ({ ok: true, body: 'MoonWitness Enterprise ORM API "status":"healthy"' })),
        pause: async () => {},
        reportFailure: (phase) => outputs.push(phase),
        getPort: async () => (port += 1),
        processId: 55,
        now: () => 1234,
        ...overrides,
      }),
  };
}

test('runs isolated Compose smoke phases and always removes only its project volumes', async () => {
  const fixture = harness();
  await fixture.run();

  const commandTexts = fixture.calls.map((args) => args.join(' '));
  assert.match(commandTexts[0], /--project-name moonwitness-smoke-55-1234/u);
  assert.match(commandTexts[0], /--wait-timeout 180 api board$/u);
  assert.ok(commandTexts.some((entry) => entry.includes('stop --timeout 45 api')));
  assert.ok(commandTexts.some((entry) => entry.endsWith('logs api')));
  assert.equal(
    commandTexts.at(-1).replaceAll('\\', '/'),
    '--project-name moonwitness-smoke-55-1234 -f X:/fixture/docker-compose.production.yml -f X:/fixture/docker-compose.smoke.yml down --volumes --remove-orphans'
  );
  assert.equal(fixture.options[0].environment.COMPOSE_PROJECT_NAME, 'moonwitness-smoke-55-1234');
  assert.equal(fixture.options[0].environment.EXISTING_ENV, 'preserved');
  assert.notEqual(
    fixture.options[0].environment.API_PORT,
    fixture.options[0].environment.BOARD_PORT
  );
});

test('reports the failing phase and still cleans up after an unhealthy endpoint', async () => {
  const fixture = harness({ request: async () => ({ ok: false, body: 'unavailable' }) });
  await assert.rejects(fixture.run(), /Container smoke failed during api_root/u);
  assert.deepEqual(fixture.outputs, ['api_root']);
  assert.match(fixture.calls.at(-1).join(' '), /down --volumes --remove-orphans$/u);
});

test('preserves a smoke failure when cleanup also fails and reports the cleanup failure', async () => {
  const calls = [];
  let port = 42000;
  await assert.rejects(
    runContainerSmoke({
      root: 'X:/fixture',
      environment: {},
      processId: 1,
      now: () => 2,
      getPort: async () => (port += 1),
      pause: async () => {},
      reportFailure: () => {},
      request: async () => ({ ok: false, body: '' }),
      execute(args) {
        calls.push(args);
        if (args.includes('down')) throw new Error('cleanup failure');
        return '';
      },
    }),
    /Container smoke failed during api_root\. Cleanup also failed\./u
  );
  assert.ok(calls.at(-1).includes('down'));
});
