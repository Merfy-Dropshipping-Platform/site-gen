import type { Config } from 'jest';

// Локально ts-jest не проверяет типы: мелкий набор идёт 3 с вместо 16 (замер
// 25.09, spec 115). В CI проверка типов остаётся, как была, — ошибка типов в
// spec-файле по-прежнему красит прогон.
const typeCheck = process.env.CI === 'true';

const config: Config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', typeCheck ? { useESM: true } : { useESM: true, tsconfig: { isolatedModules: true } }],
  },
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
  // Большой прогон (весь набор, каталог, 4+ файлов) встаёт в очередь на машину.
  globalSetup: '<rootDir>/jest.global-setup.cjs',
  globalTeardown: '<rootDir>/jest.global-teardown.cjs',
  verbose: false,
};

export default config;
