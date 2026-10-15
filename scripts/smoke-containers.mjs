import { spawnSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { request as httpRequest } from 'node:http';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_NAME_PATTERN = /^moonwitness-smoke-[a-z0-9-]+$/u;
const SHUTDOWN_PATTERN = /Graceful shutdown complete|API server shutdown complete/u;

function command(args, { root, environment, capture = false }) {
  const result = spawnSync('docker', ['compose', ...args], {
    cwd: root,
    env: environment,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error || result.status !== 0) {
    const detail = capture ? `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() : '';
    throw new Error(
      detail || `docker compose exited with status ${result.status ?? 'unknown'}`,
      result.error ? { cause: result.error } : undefined
    );
  }
  return capture ? `${result.stdout ?? ''}${result.stderr ?? ''}` : '';
}

function availablePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not reserve an available local port.'));
        return;
      }
      server.close((error) => (error ? reject(error) : resolvePort(address.port)));
    });
  });
}

async function responseText(url, { method = 'GET', headers, body } = {}) {
  return new Promise((resolveResponse, rejectResponse) => {
    const request = httpRequest(new URL(url), { method, headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () =>
        resolveResponse({
          ok:
            response.statusCode !== undefined &&
            response.statusCode >= 200 &&
            response.statusCode < 300,
          body: Buffer.concat(chunks).toString('utf8'),
        })
      );
    });
    request.setTimeout(5000, () => request.destroy(new Error('Endpoint request timed out.')));
    request.once('error', rejectResponse);
    if (body) request.write(body);
    request.end();
  });
}

async function expectEndpoint({ url, phase, includes, request, pause }) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await request(url);
      if (response.ok && response.body.includes(includes)) return;
    } catch {
      // The container may still be starting; retry without printing response or network details.
    }
    if (attempt < 19) await pause(2000);
  }
  throw new Error(`Container endpoint did not pass the ${phase} check.`);
}

export async function runContainerSmoke({
  root = ROOT,
  environment = process.env,
  execute = command,
  request = responseText,
  pause = (duration) => delay(duration),
  getPort = availablePort,
  reportFailure = (failedPhase) => {
    process.stderr.write(
      `::error title=Container smoke failed::Phase ${failedPhase} failed; inspect the authorized runner log for details.\n`
    );
  },
  processId = process.pid,
  now = Date.now,
} = {}) {
  const projectName = `moonwitness-smoke-${processId}-${now()}`;
  if (!PROJECT_NAME_PATTERN.test(projectName))
    throw new Error('Invalid smoke Compose project name.');
  const [apiPort, boardPort] = await Promise.all([getPort(), getPort()]);
  if (apiPort === boardPort) throw new Error('Smoke API and Board ports must be different.');

  const composeArgs = [
    '--project-name',
    projectName,
    '-f',
    join(root, 'docker-compose.production.yml'),
    '-f',
    join(root, 'docker-compose.smoke.yml'),
  ];
  const composeEnvironment = {
    ...environment,
    COMPOSE_PROJECT_NAME: projectName,
    DATABASE_URL: 'postgresql://postgres:postgres@postgres:5432/moonwitness_smoke',
    JWT_SECRET: 'ci-only-secret-that-is-at-least-32-characters-long',
    SUPERADMIN_PASSWORD: 'ci-smoke-superadmin-password',
    API_PORT: String(apiPort),
    BOARD_PORT: String(boardPort),
    LOG_LEVEL: 'info',
    LOG_TO_FILE: 'false',
    LOG_PRETTY: 'false',
    PRINT_ROUTES: 'false',
  };

  let failure;
  let phase = 'compose_up';
  try {
    execute(
      [
        ...composeArgs,
        'up',
        '--detach',
        '--build',
        '--wait',
        '--wait-timeout',
        '180',
        'api',
        'board',
      ],
      { root, environment: composeEnvironment }
    );

    phase = 'api_root';
    await expectEndpoint({
      url: `http://127.0.0.1:${apiPort}/`,
      phase,
      includes: 'MoonWitness Enterprise ORM API',
      request,
      pause,
    });
    phase = 'api_readiness';
    await expectEndpoint({
      url: `http://127.0.0.1:${apiPort}/readyz`,
      phase,
      includes: '"status":"healthy"',
      request,
      pause,
    });
    phase = 'api_corpus_login';
    const login = await request(`http://127.0.0.1:${apiPort}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        login: 'superadmin',
        password: composeEnvironment.SUPERADMIN_PASSWORD,
      }),
    });
    let accessToken;
    try {
      const payload = JSON.parse(login.body);
      if (login.ok && typeof payload.data?.access_token === 'string') {
        accessToken = payload.data.access_token;
      }
    } catch {
      // Keep credentials and response bodies out of the smoke failure report.
    }
    if (!accessToken) throw new Error('Smoke login did not return an access token.');

    const authorization = { authorization: `Bearer ${accessToken}` };
    phase = 'api_corpus_tanzil_source';
    await expectEndpoint({
      url: `http://127.0.0.1:${apiPort}/api/corpus/sources/${encodeURIComponent('mw:source:tanzil-quran-text')}`,
      phase,
      includes: 'mw:source:tanzil-quran-text',
      request: (url) => request(url, { headers: authorization }),
      pause,
    });
    phase = 'api_corpus_tanzil_passage';
    await expectEndpoint({
      url: `http://127.0.0.1:${apiPort}/api/corpus/passages/${encodeURIComponent('mw:edition:tanzil-quran-text-v1.1-uthmani-txt2')}/${encodeURIComponent('Q7:46')}`,
      phase,
      includes: 'mw:source:tanzil-quran-text',
      request: (url) => request(url, { headers: authorization }),
      pause,
    });
    phase = 'api_corpus_webp_source';
    await expectEndpoint({
      url: `http://127.0.0.1:${apiPort}/api/corpus/sources/${encodeURIComponent('mw:source:ebible-webp-protestant')}`,
      phase,
      includes: 'mw:source:ebible-webp-protestant',
      request: (url) => request(url, { headers: authorization }),
      pause,
    });
    phase = 'api_corpus_webp_passage';
    await expectEndpoint({
      url: `http://127.0.0.1:${apiPort}/api/corpus/passages/${encodeURIComponent('mw:edition:webp-protestant-2020-stable')}/${encodeURIComponent('Genesis 1:1')}`,
      phase,
      includes: 'In the beginning, God created the heavens and the earth.',
      request: (url) => request(url, { headers: authorization }),
      pause,
    });
    phase = 'board_root';
    await expectEndpoint({
      url: `http://127.0.0.1:${boardPort}/`,
      phase,
      includes: 'MoonWitness',
      request,
      pause,
    });
    phase = 'api_stop';
    execute([...composeArgs, 'stop', '--timeout', '45', 'api'], {
      root,
      environment: composeEnvironment,
    });
    phase = 'graceful_shutdown';
    const logs = execute([...composeArgs, 'logs', 'api'], {
      root,
      environment: composeEnvironment,
      capture: true,
    });
    if (!SHUTDOWN_PATTERN.test(logs)) throw new Error('API did not report graceful shutdown.');
  } catch (error) {
    failure = { phase, error };
  }

  let cleanupError;
  try {
    execute([...composeArgs, 'down', '--volumes', '--remove-orphans'], {
      root,
      environment: composeEnvironment,
    });
  } catch (error) {
    cleanupError = error;
  }

  if (failure) {
    reportFailure(failure.phase);
    const detail = cleanupError ? ' Cleanup also failed.' : '';
    throw new Error(`Container smoke failed during ${failure.phase}.${detail}`, {
      cause: failure.error,
    });
  }
  if (cleanupError) throw new Error('Container smoke cleanup failed.', { cause: cleanupError });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runContainerSmoke();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Container smoke failed.'}\n`);
    process.exitCode = 1;
  }
}
