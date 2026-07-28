import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// JobPilot serves the built SPA from the FastAPI app on a single origin (port 1456).
// The build writes into ../backend/app/static WITHOUT wiping it (emptyOutDir:false),
// so the co-located static/extension/ bundle folder is preserved.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  base: '/',
  build: {
    outDir: '../backend/app/static',
    emptyOutDir: false,
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:1456',
        changeOrigin: true,
        ws: true,
      },
      '/ws': {
        target: 'http://localhost:1456',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
