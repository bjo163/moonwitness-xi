import assert from 'node:assert/strict';
import test from 'node:test';
import { serializeCsv } from '../../apps/board/src/lib/csv-export.ts';

test('exports UTF-8 CSV with a BOM and RFC-4180 record separators', () => {
  const csv = serializeCsv(
    ['Name', 'Notes'],
    [
      ['日本語', 'line one\r\nline two'],
      ['Comma, and "quotes"', 'plain'],
    ]
  );

  assert.ok(csv.startsWith('\uFEFF'));
  assert.equal(
    csv,
    '\uFEFFName,Notes\r\n日本語,"line one\r\nline two"\r\n"Comma, and ""quotes""",plain'
  );
});

test('prefixes spreadsheet formulas after leading whitespace', () => {
  const csv = serializeCsv(['Value'], [[' =1+1'], ['+SUM(A1:A2)'], ['-1+2'], ['@SUM(A:A)']]);

  assert.equal(csv, "\uFEFFValue\r\n' =1+1\r\n'+SUM(A1:A2)\r\n'-1+2\r\n'@SUM(A:A)");
});

test('quotes headers and cells containing commas, quotes, carriage returns, or line feeds', () => {
  const csv = serializeCsv(['A,B', 'Quote"'], [['one\rtwo', 'three\nfour']]);

  assert.equal(csv, '\uFEFF"A,B","Quote"""\r\n"one\rtwo","three\nfour"');
});
