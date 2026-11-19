import path from 'node:path';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  // La API (`npm run api` en la raíz) escucha en 127.0.0.1:API_PORT. Vite la expone en /api, así el
  // panel y la API comparten origen (sin CORS). Solo se leen variables API_* del .env de la raíz.
  const env = loadEnv(mode, '..', 'API_');
  const api = `http://127.0.0.1:${env.API_PORT || 3000}`;

  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': path.resolve(__dirname, './src') } },
    server: {
      port: 5173,
      proxy: { '/api': { target: api, changeOrigin: true } },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['src/test/setup.ts'],
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
  };
});
