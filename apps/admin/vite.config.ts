import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Use the shared package's TypeScript source (its dist/ is CommonJS for Node).
const sharedSrc = fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url));

/**
 * The console calls the API at /v1 on its own origin. In development Vite
 * forwards /v1 to the API, so the session cookie is same-origin and no CORS is
 * needed. In production, serve the console and the API from one domain the same way.
 */
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@wasla/shared': sharedSrc } },
  server: {
    port: 3000,
    strictPort: true,
    proxy: { '/v1': { target: process.env.WASLA_API_ORIGIN ?? 'http://localhost:4000', changeOrigin: false } },
  },
  preview: { port: 3000 },
  build: { outDir: 'dist', sourcemap: false },
});
