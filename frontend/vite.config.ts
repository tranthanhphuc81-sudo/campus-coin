/**
 * vite.config.ts
 * Vite dev server/build config + Vitest config for the SPA.
 * - The dev server listens on WEB_PORT (default 5174); `strictPort` fails loudly instead of
 *   silently moving to another port that would not match APP_URL/CORS_ORIGINS.
 * - `/api` is proxied to the local API on API_PORT (default 3000), so the browser sees one
 *   origin (refresh-token cookie stays same-site, no CORS needed locally).
 * - `envDir` points at the repo root so the single root `.env` is used; only `VITE_*`
 *   variables are exposed to client code (they must never contain secrets).
 * Spec: docs/spec/03 §3.2 · docs/spec/10 §11.3 (environment configuration)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_API_PORT, DEFAULT_WEB_PORT, parsePort } from '@campuscoin/shared';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default defineConfig(({ mode }) => {
  // '' prefix = read all vars (WEB_PORT/API_PORT are only used here, never sent to the client).
  const env = loadEnv(mode, rootDir, '');
  const webPort = parsePort(env.WEB_PORT, DEFAULT_WEB_PORT, 'WEB_PORT');
  const apiPort = parsePort(env.API_PORT, DEFAULT_API_PORT, 'API_PORT');

  return {
    plugins: [react()],
    envDir: rootDir,
    server: {
      port: webPort,
      strictPort: true,
      proxy: {
        '/api': {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          // Bootstrap 5.3 still uses Sass @import/global functions internally; hide those
          // third-party deprecation warnings so our own warnings stay visible.
          quietDeps: true,
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
    },
  };
});
