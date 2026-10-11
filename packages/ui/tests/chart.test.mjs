import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BarChart, LineChart } from '../dist/components/chart.js';

test('bar chart provides localized values, SVG tooltips, and accessible table alternatives', () => {
  const html = renderToStaticMarkup(
    React.createElement(BarChart, {
      title: 'Job state distribution',
      locale: 'id-ID',
      data: [
        { label: 'Queued', value: 1200 },
        { label: 'Running', value: 0 },
      ],
    })
  );
  assert.match(html, /role="img" aria-label="Job state distribution"/);
  assert.match(html, /<title>Queued: 1\.200<\/title>/);
  assert.match(html, /<caption>Job state distribution<\/caption>/);
  assert.match(html, /<th scope="row">Running<\/th><td>0<\/td>/);
});

test('charts distinguish loading, error, empty, and zero-valued data states', () => {
  const loading = renderToStaticMarkup(
    React.createElement(BarChart, { title: 'Queue', data: [], loading: true })
  );
  const error = renderToStaticMarkup(
    React.createElement(BarChart, { title: 'Queue', data: [], error: 'Offline' })
  );
  const empty = renderToStaticMarkup(React.createElement(BarChart, { title: 'Queue', data: [] }));
  const zero = renderToStaticMarkup(
    React.createElement(BarChart, { title: 'Queue', data: [{ label: 'Queued', value: 0 }] })
  );
  assert.match(loading, /role="status"/);
  assert.match(error, /role="alert"[^>]*>Offline/);
  assert.match(empty, /No chart data available/);
  assert.match(zero, /<rect[^>]*width="0"[^>]*height="20"/);
  assert.match(zero, /<td>0<\/td>/);
});

test('line chart includes series legend, locale formatter hook, and time label table', () => {
  const html = renderToStaticMarkup(
    React.createElement(LineChart, {
      title: 'Requests over time',
      labels: ['09.00', '10.00'],
      valueLabel: 'Requests',
      renderValue: (value) => `${value} req`,
      series: [{ label: 'API', values: [4, Number.NaN] }],
    })
  );
  assert.match(html, /<title>API, 09\.00: 4 req<\/title>/);
  assert.match(html, /Chart series/);
  assert.match(html, /<th scope="col">10\.00<\/th>/);
  assert.match(html, /—/);
});
