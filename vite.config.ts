import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      proxy: {
        '/analyze': { target: process.env.PYTHON_BACKEND_URL || 'http://127.0.0.1:8000', changeOrigin: true, timeout: 660000 },
        '/generate_pdf': { target: process.env.PYTHON_BACKEND_URL || 'http://127.0.0.1:8000', changeOrigin: true },
        '/health': { target: process.env.PYTHON_BACKEND_URL || 'http://127.0.0.1:8000', changeOrigin: true },
      },
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
