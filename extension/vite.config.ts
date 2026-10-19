import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.json';

const r = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export const alias = {
  '@domain': r('./src/domain'),
  '@application': r('./src/application'),
  '@infrastructure': r('./src/infrastructure'),
  '@ui': r('./src/ui'),
  '@shared': r('../shared/src'),
};

// Сборка для Chrome Web Store: без доступа к localhost (публичный сервер отвечает по CORS)
const isStoreBuild = process.env['VITE_STORE_BUILD'] === 'true';
const buildManifest = isStoreBuild
  ? { ...manifest, host_permissions: manifest.host_permissions.filter((h) => !h.startsWith('http://localhost')) }
  : manifest;

export default defineConfig({
  plugins: [react(), crx({ manifest: buildManifest })],
  resolve: { alias },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      // Страницы, не указанные в manifest напрямую: sidebar (iframe из content script) и offscreen-документ
      input: {
        sidebar: r('./src/ui/sidebar/index.html'),
        offscreen: r('./src/offscreen/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5173 },
  },
});
