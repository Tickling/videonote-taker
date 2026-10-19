import { defineConfig } from 'vitest/config';
import { alias } from './vite.config';

// Отдельный конфиг без CRXJS-плагина: тестам не нужна сборка расширения
export default defineConfig({
  resolve: { alias },
  test: {
    environment: 'node',
    passWithNoTests: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', '../shared/src/**/*.test.ts'],
    coverage: {
      include: ['src/domain/**', 'src/application/**'],
    },
  },
});
