import { contentHash } from './content-hash';

// Файлы, от которых зависят страницы магазина новой темы (design.md блока 4, В4-1 В). Пути — от корня site-gen.

// Файлы папки темы. render — от них зависят страницы магазина, они входят в отпечаток темы. skip — не зависят: обычная
// сборка темы и стенд, установка. Каждый файл папки темы — ровно в одном списке, это сторожит тест «файл не учтён».
// Секций у темы нет (блок 1 «Секций и SDK»: секции не привязаны к темам), папки sections/ в теме не бывает.
export const THEME_FILES = {
  render: ['src/shop/**', 'public/**', 'astro.renderer.config.mjs', 'pnpm-lock.yaml', 'tsconfig.json'],
  skip: ['src/pages/**', 'src/stand/**', 'astro.config.mjs', 'package.json', '.gitignore', '.npmrc'],
} as const;

// Отпечаток темы — её файлы render, theme.json пакета темы (токены, блок 1) и шаги перевода правок (блок 10). Журнал
// версий changelog.json на страницы не влияет и в отпечаток не входит.
export const themeRenderFiles = (themeId: string): string[] => [
  ...THEME_FILES.render.map((pattern) => `themes/${themeId}/${pattern}`),
  `packages/theme-${themeId}/theme.json`,
  `packages/theme-${themeId}/migrations.json`,
];

// Код платформы, который рисует страницы новой темы: этот пакет, конфиг витрины (блок 3) и токены (блок 1). Тест
// «импорт не учтён» идёт по импортам src/ пакета и проверяет, что каждый файл, до которого они доходят, — в этом списке.
export const PLATFORM_RENDER_FILES = [
  'packages/storefront-build/package.json',
  'packages/storefront-build/src/**',
  // Особые страницы платформы (блок 7, часть 7а): новая строка — новый код платформы, его разносит выпуск волнами.
  'packages/storefront-build/special-pages.json',
  'packages/storefront-config/package.json',
  'packages/storefront-config/src/**',
  'packages/storefront-config/rebuild-events.json',
  'packages/tokens/package.json',
  'packages/tokens/src/**',
  'packages/tokens/dictionary.json',
  'packages/tokens/not-tokens.json',
  'packages/tokens/search-words.json',
  // Реестр шрифтов (блок 12): из него сборка печатает CSS шрифтов. Новая библиотека — новый код платформы: её разносит
  // выпуск платформы волнами, как и новый renderHash.
  'packages/theme-contract/fonts/fonts.json',
  // Ядро @merfy/shell (блок 7): вход shell меняет только выкатка кода платформы. Оно в отпечатке, чтобы новое ядро
  // разносил выпуск платформы волнами (блок 10, задача 11): его отпечаток — renderHash. Папка
  // packages/storefront-shell/sections — исходники наших секций: в магазин они идут как свои секции магазина (блок 1
  // «Секций и SDK», пп. 1, 27), это не код платформы.
  'packages/storefront-shell/package.json',
  'packages/storefront-shell/core-parts.json',
  'packages/storefront-shell/scripts/**',
  'packages/storefront-shell/src/**',
  // Рендер секций (блок 1 «Секций и SDK»): приём, компиляция шаблона и процесс рендера — код платформы, от него
  // зависят страницы.
  'packages/storefront-sections/package.json',
  'packages/storefront-sections/src/**',
];

export const platformRenderHash = (root: string): Promise<string> => contentHash(root, PLATFORM_RENDER_FILES);
