import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeTypeScriptDiagnostics } from './typescript-diagnostics.mjs';

test('TypeScript annotations retain file and code while omitting diagnostic text', () => {
  const diagnostics = summarizeTypeScriptDiagnostics(
    'src/models.ts(14,9): error TS2322: password=top-secret\n',
    'X:/repo/moonwitness',
    'X:/repo/moonwitness/packages/orm-request'
  );

  assert.deepEqual(diagnostics, [
    { path: 'packages/orm-request/src/models.ts', line: 14, column: 9, code: 'TS2322' },
  ]);
  assert.doesNotMatch(JSON.stringify(diagnostics), /top-secret|password/u);
});

test('TypeScript annotations handle Windows paths and pathless compiler errors', () => {
  assert.deepEqual(
    summarizeTypeScriptDiagnostics(
      'X:\\repo\\moonwitness\\packages\\orm-base\\src\\index.ts(2,3): error TS2307: private text\n',
      'X:\\repo\\moonwitness',
      'X:\\repo\\moonwitness\\packages\\orm-base'
    ),
    [{ path: 'packages/orm-base/src/index.ts', line: 2, column: 3, code: 'TS2307' }]
  );
  assert.deepEqual(summarizeTypeScriptDiagnostics('error TS5058: private path\n'), []);
});
