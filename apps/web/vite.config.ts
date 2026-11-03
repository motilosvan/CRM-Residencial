import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // La API (`npm run api` en la raíz) escucha en 127.0.0.1:API_PORT. Vite la expone en /api, así el
  // panel y la API comparten origen (sin CORS). Solo se leen variables API_* del .env de la raíz.
  const env = loadEnv(mode, '../..', 'API_');
  const api = `http://127.0.0.1:${env.API_PORT || 3000}`;

  return {
    plugins: [react()],
    server: {
      proxy: { '/api': { target: api, changeOrigin: true } },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
  };
});
