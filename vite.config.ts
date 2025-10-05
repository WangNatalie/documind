import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest: manifest as any }),
  ],
  assetsInclude: ['.../src/assets/fonts/Lacquer-Regular.woff2'],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        viewer: 'viewer.html',
        popup: 'popup.html',
        offscreen: 'offscreen.html',
      },
    },
    target: 'esnext',
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
  },
  optimizeDeps: {
    exclude: ['pdfjs-dist'],
  },
});
