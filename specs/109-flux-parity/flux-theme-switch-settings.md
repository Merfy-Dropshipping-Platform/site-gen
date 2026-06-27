# Flux: при переключении применять полный канон верстальщиков (reset + наполнение товарами с нуля)

> Spec в рамках `109-flux-parity`. Дата: 2026-06-27. Подход: **B** (полный flux-канон верстальщиков). Scope: **только Flux**.

## Проблема (root cause, доказано)

Переключение темы (`selectTheme` → PATCH `/sites/:id {themeId}` → `sites.service.update()`) меняет **только** `site.theme_id`. В `site_revision.data` от прошлой темы остаются запечёнными **И палитра** (`themeSettings.colorSchemes`) **И контент/раскладка** (header `siteTitle`, секции, тексты). Reseed-блок (`sites.service.ts:710-730`) гейтится `shouldReseed = !hasThemeSettings` и пропускается, как только в ревизии уже есть схемы → новая тема не применяется.

**Пруф (live, Playwright + SQL):** fresh-сайт `10caf133`, свитч vanilla→rose. Итог: `theme_id='rose'`, но `colorSchemes[0]="Dark Olive" #26311c` + header `siteTitle="Vanilla Pilot"` + меню Мебель/Декор. Рендер «ванильный» при теме Rose → «все темы одинаковые». Тест-акк `merfytheme69789886@gmail.com` / `Theme2026!`.

**Что уже работает (НЕ root cause):** на **live** рендер берёт тему из `theme_id` (дифф шрифтов 5 published-сайтов: flux→Roboto Flex, rose→Comfortaa, ...). Секции/шелл/шрифты верстальщиков переключаются на published+republish. Застревают именно **палитра + контент** в ревизии.

## Цель

Применение темы **Flux** = полный **канон верстальщиков Flux**: дизайн, раскладка, палитра (Black/White/LightGray/Dark + `#fa5109`), хром (two-tier header, Roboto Flex), как они и делали. **Товарные секции наполняются товарами с нуля** из живого каталога мерчанта.

**Канон уже в репо** (создавать не нужно): `defaults/flux.json` → `pagesData.home`: `Header(siteTitle "Flux")`, `Hero`, `Collections{dataSource:"auto", collections:[]}`, `PopularProducts{dataSource:"auto", collection:""}`, `MainText`, `Gallery`, `Footer` + flux `colorSchemes`. `dataSource:"auto"` + пустые списки = секции **сами заполняются товарами/коллекциями мерчанта из API** (нет запечённых демо-id). `theme-flux/theme.json` → fonts Roboto Flex/Barlow, accent `#fa5109`, blockDefaults two-tier/rich/tile.

## Дизайн (подход B)

В `sites.service.update()`, в существующем reseed-блоке (`710-730`), **снять гейт для свитча на flux** — заставить reseed при реальной смене на flux:

```
// внутри блока `if (row && nextThemeId)`, рядом с вычислением shouldReseed:
if (nextThemeId === 'flux' && nextThemeId !== prevThemeId) {
  shouldReseed = true;   // полный канон верстальщиков Flux, а не stuck-настройки
}
```

Дальше работает существующая машинерия:
- `buildInitialRevision('flux')` → (flux partial manifest → fallback `getDefaultContent('flux')`) → `defaults/flux.json` = канон верстальщиков.
- `createRevision({ data: fluxCanon, setCurrent: true, meta:{ title:'Flux theme applied (verstalshchiki canon)' } })`.
- Республиш-блок (`760-779`): published-сайт пересоберётся → live = аутентичный Flux. Draft — на следующем publish.

### Поведение
- **Полный сброс** дизайна/раскладки ревизии к flux-канону (кастомная домашняя раскладка НЕ сохраняется — это и есть «как у верстальщиков»).
- **Товары с нуля:** `Collections`/`PopularProducts` (`dataSource:auto`, пустые) → заполняются каталогом мерчанта из API на рендере/гидрации (товары/коллекции живут в **product-сервисе**, ревизией не затрагиваются).
- **flux→flux** (re-save, `prevThemeId===flux`): reseed НЕ срабатывает → правки на flux не теряются.
- **Идемпотентность:** условие `nextThemeId !== prevThemeId` = один проход на реальный свитч.

## Вне scope
- Другие темы (rose/vanilla/bloom/satin) — тот же баг, фиксим **только Flux** (паттерн расширяемый: позже `THEMES_RESEED_ON_SWITCH = ['flux', ...]`).
- Сохранение кастомной раскладки при свитче — осознанно НЕТ (противоречит «1-в-1 как у верстальщиков»).
- Per-section парити секций (Hero/Popular/Catalog) — отдельные пункты `FLUX_PARITY_PLAN.md`.

## Тестирование (TDD + прод-пруфы)
1. **Unit (`sites.service.update`)**: свитч X→flux на ревизии с чужими schemes/контентом → новая ревизия == flux-канон (`colorSchemes[0].background='#000000'`, `primaryButton.background='#fa5109'`; home Header `siteTitle='Flux'`; `Collections.dataSource='auto'`). Свитч flux→flux НЕ плодит reseed-ревизию. Свитч flux→rose НЕ затронут (scope flux-only).
2. **Live-пруф (QA Flux `8df3b745` / тест-акк `10caf133`)**: свитч на flux → SQL: ревизия = flux-канон; рендер: чёрный/оранж `#fa5109` + Roboto Flex + товарные секции наполнены реальным каталогом (не демо, не пусто). Playwright-скрин до/после + SQL.

## Приёмка
- [ ] Свитч на Flux → ревизия = полный flux-канон верстальщиков (SQL).
- [ ] Live/preview = аутентичный Flux (дизайн/палитра/шрифты верстальщиков), НЕ «как прошлая тема».
- [ ] Товарные секции заполнены товарами мерчанта **с нуля** (из каталога), не демо/не пусто.
- [ ] flux→flux не сбрасывает правки; rose/vanilla/bloom/satin не затронуты.
