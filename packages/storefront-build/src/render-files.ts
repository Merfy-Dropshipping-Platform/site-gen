import { contentHash } from './content-hash';

// Файлы, от которых зависят страницы магазина новой темы (design.md блока 4, В4-1 В). Пути — от корня site-gen.

// Файлы папки темы. render — от них зависят страницы магазина, они входят в отпечаток темы. skip — не зависят: обычная
// сборка темы и стенд, установка. Каждый файл папки темы — ровно в одном списке, это сторожит тест «файл не учтён».
export const THEME_FILES = {
  render: ['src/shop/**', 'public/**', 'astro.renderer.config.mjs', 'pnpm-lock.yaml', 'tsconfig.json'],
  skip: ['src/pages/**', 'src/stand/**', 'astro.config.mjs', 'package.json', '.gitignore', '.npmrc'],
} as const;

// Отпечаток темы — её файлы render и theme.json пакета темы: токены темы (блок 1).
export const themeRenderFiles = (themeId: string): string[] => [
  ...THEME_FILES.render.map((pattern) => `themes/${themeId}/${pattern}`),
  `packages/theme-${themeId}/theme.json`,
];

// Код платформы, который рисует страницы новой темы. Тест «импорт не учтён» идёт по импортам src/ пакета и проверяет,
// что каждый файл, до которого они доходят, — в этом списке.
export const PLATFORM_RENDER_FILES = ['packages/storefront-build/package.json', 'packages/storefront-build/src/**'];

export const platformRenderHash = (root: string): Promise<string> => contentHash(root, PLATFORM_RENDER_FILES);
