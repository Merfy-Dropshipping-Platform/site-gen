import { defineConfig } from 'vitest/config';

// Тесты ядра секций (design.md блока 5 «Секций и SDK»). unit — jsdom: сторы, части SDK, ctx, аналитика; файлы сборки
// ядра помечены «@vitest-environment node»: esbuild в jsdom не работает. browser — настоящий Chromium (Playwright):
// ядро секций, поведения, аналитика в бандле страницы (`pnpm test:browser`).
// Порог покрытия — от 80 % (решение владельца 23.09), его считает unit (`pnpm test:coverage`).

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'build/**/*.ts'],
      // Поведения и появления (блок 6) работают с вёрсткой и WAAPI — их покрывают тесты Chromium (проект browser).
      exclude: [
        'src/core/index.ts',
        'src/core/behaviors/index.ts',
        'src/core/behaviors/{accordion,dialog,carousel,tabs,nav-menu,quantity,card-photos,sticky-header,video,reveal,motion}.ts',
        // Вход скрипта превью (часть 5г): blob: и import() — тест в браузере preview-replace.browser.test.ts.
        'src/preview/entry.ts',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
    projects: [
      {
        // shop-markup.test.ts (plan-7b, 7б-3) читает шаблоны секций из соседнего пакета: в jsdom глобальный URL —
        // не node-овский, fileURLToPath на таком URL не работает; для этого файла среда node.
        extends: true,
        test: { name: 'unit-node', environment: 'node', include: ['__tests__/shop-markup.test.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['__tests__/*.test.ts'],
          exclude: ['**/node_modules/**', '__tests__/shop-markup.test.ts'],
        },
      },
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
