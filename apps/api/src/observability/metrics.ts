export interface HttpMetric {
  count: number;
  seconds: number;
}

const httpMetrics = new Map<string, HttpMetric>();

function escapeLabel(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n');
}

export function recordHttpRequest(method: string, route: string, status: number, seconds: number) {
  const key = [method, route, String(status)].join('\u0000');
  const current = httpMetrics.get(key) ?? { count: 0, seconds: 0 };
  current.count += 1;
  current.seconds += seconds;
  httpMetrics.set(key, current);
}

export function renderMetrics(uptimeSeconds: number): string {
  const lines = [
    '# HELP moonwitness_http_requests_total Completed HTTP requests.',
    '# TYPE moonwitness_http_requests_total counter',
  ];
  for (const [key, metric] of httpMetrics) {
    const [method, route, status] = key.split('\u0000');
    const labels = `method="${escapeLabel(method ?? '')}",route="${escapeLabel(route ?? '')}",status="${escapeLabel(status ?? '')}"`;
    lines.push(`moonwitness_http_requests_total{${labels}} ${metric.count}`);
  }
  lines.push(
    '# HELP moonwitness_http_request_duration_seconds_sum Total HTTP request duration.',
    '# TYPE moonwitness_http_request_duration_seconds_sum counter'
  );
  for (const [key, metric] of httpMetrics) {
    const [method, route, status] = key.split('\u0000');
    const labels = `method="${escapeLabel(method ?? '')}",route="${escapeLabel(route ?? '')}",status="${escapeLabel(status ?? '')}"`;
    lines.push(`moonwitness_http_request_duration_seconds_sum{${labels}} ${metric.seconds}`);
  }
  lines.push(
    '# HELP moonwitness_http_request_duration_seconds_count Completed request duration observations.',
    '# TYPE moonwitness_http_request_duration_seconds_count counter'
  );
  for (const [key, metric] of httpMetrics) {
    const [method, route, status] = key.split('\u0000');
    const labels = `method="${escapeLabel(method ?? '')}",route="${escapeLabel(route ?? '')}",status="${escapeLabel(status ?? '')}"`;
    lines.push(`moonwitness_http_request_duration_seconds_count{${labels}} ${metric.count}`);
  }
  lines.push(
    '# HELP moonwitness_process_uptime_seconds Process uptime.',
    '# TYPE moonwitness_process_uptime_seconds gauge',
    `moonwitness_process_uptime_seconds ${uptimeSeconds}`
  );
  return `${lines.join('\n')}\n`;
}
