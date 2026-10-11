import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(import.meta.dirname, '../..'), '');
  // Dev proxy keeps the board same-origin with the API, so no CORS or base URL juggling.
  const apiTarget = env.BOARD_API_TARGET ?? `http://localhost:${env.API_PORT ?? env.PORT ?? 3000}`;
  const proxy = Object.fromEntries(
    ['/api', '/auth', '/jsonrpc', '/health', '/notifications', '/workflows'].map((route) => [
      route,
      { target: apiTarget, changeOrigin: true },
    ])
  );

  return {
    plugins: [react(), tailwindcss()],
    build: { manifest: true },
    resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
    server: { port: 5173, proxy },
    preview: { port: 4173, proxy },
  };
});
