import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxyTarget = process.env.VITE_BACKEND_PROXY_TARGET || 'http://localhost:8000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    watch: {
      usePolling: true,
      interval: 300
    },
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true
      },
      '/v1': {
        target: proxyTarget,
        changeOrigin: true
      }
    }
  }
});
