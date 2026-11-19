import { defineConfig } from 'vitest/config';

// Порог покрытия новых модулей — от 80 % (решение владельца 23.09). Здесь быстрые тесты: __tests__/*.test.ts, без
// базы, брокера и хранилища, и покрытие — модулей без ввода-вывода. Всё src/ — база sites, RabbitMQ, MinIO — покрывают
// тесты на стенде, __tests__/stack/*.test.ts, команда `pnpm test:stack` (vitest.stack.config.ts).
export default defineConfig({
  test: {
    // __tests__/release/ — чистые части выпуска (блок 10): модули без ввода-вывода. Остальное в src/release/ покрывают
    // тесты на стенде (vitest.stack.config.ts берёт src/**/*.ts).
    include: ['__tests__/*.test.ts', '__tests__/release/*.test.ts'],
    // Тест тем грузит серверную сборку nova и под нагрузкой машины не укладывается в 5 с по умолчанию.
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: [
        'src/{errors,parse,log,events,settings,slots,themes,theme-panels,indexnow,preview,inline-assets,preview-policy}.ts',
        'src/{section-tools,sdk-docs}.ts',
        'src/release/{waves,kinds,checks,page-check,dry-run,report}.ts',
        // Код секций в ответах превью (блок 5, часть 5г).
        'src/preview-code.ts',
        // Снимок черновика (28.10): задание, вес снимков, фильтр адресов. Браузерная часть (look-browser, look-page)
        // проверяется настоящим Chromium в __tests__/look-browser.test.ts — без браузера тест пропускается.
        'src/look/{look-job,look-fit,look-guard,look-queue,look-layout}.ts',
        // Web Vitals и Lighthouse в снимке (18.11): разбор и находки. Скрипты страниц и подключение Lighthouse к вкладке
        // (look-audit) проверяет настоящий Chromium в __tests__/look-vitals-browser.test.ts.
        'src/checks/browser/{vitals,lighthouse}.ts',
        // Аудит опубликованных страниц после публикации (20.11): отчёт Lighthouse, правила «стало хуже», запуск, прогон,
        // запись и чтение итога. Прогон в настоящем Chromium — __tests__/look-audit-browser.test.ts.
        'src/checks/audit/{report,compare}.ts',
        'src/audit/{contract,plan,start,run,results,store,answer,read}.ts',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
