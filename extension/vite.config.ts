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
const YOUTUBE = (pattern: string): boolean => /youtube\.com/.test(pattern);
// Магазин: только YouTube, без сервера (Rutube/VK — в полной версии со своим сервером)
const buildManifest = isStoreBuild
  ? {
      ...manifest,
      description: 'Конспекты видео YouTube с таймкодами: идеи, цитаты, выводы, скриншоты, экспорт в Word. Бесплатно с ключом Groq.',
      host_permissions: manifest.host_permissions.filter((h) => !h.startsWith('http://localhost')),
      content_scripts: manifest.content_scripts.map((cs) => ({ ...cs, matches: cs.matches.filter(YOUTUBE) })),
      web_accessible_resources: manifest.web_accessible_resources.map((r) => ({ ...r, matches: r.matches.filter(YOUTUBE) })),
    }
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
