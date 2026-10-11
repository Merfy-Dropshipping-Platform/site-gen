import { defineConfig } from 'vitest/config';

// Тесты ядра витрины (design.md блока 7). unit — jsdom: реестр, элемент <merfy-section>, загрузчик, части ядра,
// превью; файлы сборки ядра помечены «@vitest-environment node»: esbuild в jsdom не работает. browser — настоящий
// Chromium (Playwright) по собранному ядру: import map, ошибки модулей, повтор загрузки (`pnpm test:browser`).
// Порог покрытия — от 80 % (решение владельца 23.09), его считает unit (`pnpm test:coverage`).
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'build/**/*.ts'],
      exclude: ['src/browser.ts', 'src/index.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
    projects: [
      { extends: true, test: { name: 'unit', environment: 'jsdom', include: ['__tests__/*.test.ts'] } },
      {
        extends: true,
        test: {
          name: 'browser',
          environment: 'node',
          include: ['__tests__/browser/*.test.ts'],
          // Файлы — по одному, в одном процессе: у каждого свой Chromium. fileParallelism vitest 3.2 в проекте не
          // принимает, singleFork — то же самое для одного проекта; unit идёт параллельно.
          poolOptions: { forks: { singleFork: true } },
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
