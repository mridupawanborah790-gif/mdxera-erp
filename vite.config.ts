import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Exclude sqlocal from dependency optimization to fix the "worker?worker_file" error
  optimizeDeps: {
    exclude: ['sqlocal']
  },
  server: {
    port: 5173,
    host: true,
    headers: {
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Opener-Policy': 'same-origin',
    }
  },
  // Ensure workers are handled as separate chunks for WASM compatibility
  worker: {
    format: 'es'
  }
});
