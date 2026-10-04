import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const appDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: appDirectory,
  base: process.env.MW_DOCS_BASE_PATH ?? '/moonwitness-xi/',
  envPrefix: ['VITE_', 'MW_DOCS_'],
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
});
