# Theme Settings (панель «Настрой свою тему») — rose 13/13 ✓ (2026-08-09, эталон-гейт)

`node theme-registry/theme-gate.mjs --theme rose` — те же 13 проверок, что во
flux-отчёте (см. reports/flux/ThemeSettings.md, там же список «не покрыто»).

## Что чинилось на rose (worktree отставал от origin/main)
- Эмиттер `src/themes/tokens-css.ts`: порт `--section-gap` owl-правила и гейтед
  типографики (font/weight override в @layer utilities) из origin/main.
- `themes/rose/src/styles/global.css`: порт `@layer base [data-nt="rose-product-card"]`
  (фон/бордер/радиус/паддинг плашки + медиа-радиус `!important` + выравнивание) —
  фикс 5fb0925f был только на origin/main.
- `packages/theme-rose/blocks/Catalog/Catalog.astro`: CARD_CONTAINER_STYLE
  border-radius `var(--radius-media,8px)` → `var(--product-card-radius,8px)` (порт origin/main).

## Замер-якоря (уточнения контракта, не баги rose)
- Насыщенность/Шрифт — работают через гейтед override (Hero h1 хардкодит font-normal,
  override бьёт только при заданном слайдере).
- Скругление полей — консумер = ОБЁРТКА инпута (`div:has(> input[type="email"])`).
- Лого rose текстовое → мерится ссылка лого (`a[href$="/"]`), height растёт с кеглем.
