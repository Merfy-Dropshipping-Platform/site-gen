import { defineConfig } from 'vitest/config';

// Тесты документации SDK (блок 14 «Секций и SDK», 14.2): шаблон и примеры проходят проверку при сохранении, generated/
// совпадает с генерацией, ссылки ведут на файлы и якоря. Проверка секций идёт в отдельных процессах — тайм-аут больше.
export default defineConfig({
  test: {
    include: ['__tests__/*.test.ts'],
    testTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
