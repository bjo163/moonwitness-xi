import baseConfig from './packages/eslint-config/index.js';

export default [
  ...baseConfig,
  {
    files: ['**/*.mjs'],
    languageOptions: {
      // .mjs files in this workspace are Node.js scripts, CLI tools, and tests.
      globals: { Buffer: 'readonly', console: 'readonly', process: 'readonly' },
    },
  },
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'services/**', 'pnpm-lock.yaml', '.env*'],
  },
];
