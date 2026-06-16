import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Фронт проксирует /api на бэкенд (по умолчанию http://localhost:3001),
// чтобы в dev не упираться в CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.API_TARGET ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
