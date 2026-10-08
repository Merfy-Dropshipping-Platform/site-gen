import { defineConfig } from 'vitest/config';

// Порог покрытия новых модулей — от 80 % (решение владельца 23.09). Здесь быстрые тесты: __tests__/*.test.ts,
// хранилище в них — память (__tests__/memory-store.ts). Хранилище S3 проверяют тесты на настоящем MinIO —
// __tests__/minio/*.test.ts, команда `pnpm test:minio` (vitest.minio.config.ts), поэтому s3-store.ts здесь не считаем.
export default defineConfig({
  test: {
    include: ['__tests__/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/store.ts', 'src/s3-store.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
