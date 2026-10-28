import type { Config } from 'jest';

// Локально ts-jest не проверяет типы: мелкий набор идёт 3 с вместо 16 (замер
// 25.09, spec 115). В CI проверка типов остаётся, как была, — ошибка типов в
// spec-файле по-прежнему красит прогон.
const typeCheck = process.env.CI === 'true';

// Пакеты только в ESM, которые нужны коду sites: sanitize-html (очистка текста с начертаниями при записи ревизии,
// packages/storefront-sections/src/inline-text.ts) тянет htmlparser2 12 и его зависимости. Node 24 в образе
// загружает их через require сам, загрузчик jest — нет.
const ESM_ONLY_DEPS = ['htmlparser2', 'domhandler', 'domutils', 'domelementtype', 'dom-serializer', 'entities'].join('|');

const config: Config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    // Зависимости только в ESM (ESM_ONLY_DEPS) — переводом в CommonJS без проверки типов.
    '/node_modules/.+\\.js$': ['ts-jest', { useESM: true, tsconfig: { isolatedModules: true, allowJs: true } }],
    '^.+\\.(t|j)s$': ['ts-jest', typeCheck ? { useESM: true } : { useESM: true, tsconfig: { isolatedModules: true } }],
  },
  // Остальные node_modules jest не переводит, как по умолчанию.
  transformIgnorePatterns: [`/node_modules/(?!\\.pnpm/(${ESM_ONLY_DEPS})@|(${ESM_ONLY_DEPS})/)`],
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  setupFiles: [
    // Рендер секций в уже запущенном потоке вместо нового процесса на вызов
    // (spec 115, часть 2). MERFY_RENDER_BRIDGE=off — старый путь, =verify — оба
    // пути с побайтной сверкой HTML.
    '<rootDir>/src/themes/__tests__/render-bridge.cjs',
  ],
  // Запись входов каждого файла для памяти результатов `pnpm checks` (spec 115,
  // часть 3). Работает только при MERFY_TRACE_DIR, иначе ничего не делает.
  setupFilesAfterEnv: ['<rootDir>/scripts/release/lib/trace/jest-trace-setup.cjs'],
  // Большой прогон (весь набор, каталог, 4+ файлов) встаёт в очередь на машину.
  globalSetup: '<rootDir>/jest.global-setup.cjs',
  globalTeardown: '<rootDir>/jest.global-teardown.cjs',
  verbose: false,
};

export default config;
