/**
 * Полная пересборка в порядке CI — общая для поезда и `pnpm checks`.
 *
 * Порядок не случаен: кандидат инвентаря satin считается по результату
 * run-theme-build satin (без него локально зелено, а CI краснеет «tracked
 * inventory is stale»), а build:preview-tailwind нужен раньше гардов — без
 * бандла превью часть из них не находит, что мерить.
 */
export const BUILD_SEQUENCE = [
  ['pnpm build', 'сборка сервиса'],
  ['pnpm build:blocks', 'блоки Astro'],
  ['pnpm build:theme-sections satin', 'секции satin'],
  ['pnpm exec tsx scripts/run-theme-build.ts satin', 'НАСТОЯЩАЯ сборка темы satin — по ней считается кандидат инвентаря'],
  ['pnpm build:theme-sections:all', 'секции всех пяти тем — иначе снимкам не с чем сравнивать'],
  ['pnpm build:preview-tailwind', 'бандл превью — без него часть гардов даёт ноль проверок'],
];
