# Rose Heading Size Fixes — Design

## Goal

Исправить три подтверждённых no-op настройки размера заголовка в теме Rose:

- `ContactForm`: панель сохраняет `heading.size`, но секция его не применяет.
- `Gallery`: панель сохраняет top-level `headingSize`, но renderer отдаёт приоритет legacy `heading.size`.
- `Collections`: panel/props корректно меняют top-level `headingSize`, но dynamic Tailwind custom-property utility не действует в production preview.

После исправления `small / medium / large` должны менять computed font-size на desktop и mobile без изменения формата ревизий.

## Scope

Первый пакет ограничен:

- `themes/rose/src/components/sections/Contacts.astro`
- `themes/rose/src/components/sections/Gallery.astro`
- `themes/rose/src/components/sections/Collections.astro`
- небольшим pure helper в `themes/rose/src/lib/`, если он нужен для тестируемой политики precedence;
- regression-тестами и Playwright smoke.

Не входят: потерянный subtitle Gallery, остальные findings, Puck schemas, migrations, другие темы, padding, uploads, arrays и publish pipeline.

## Root Causes

### ContactForm

Constructor пишет `heading.size`. `Contacts.astro` читает только текст и не передаёт размер в CSS; mobile дополнительно фиксирован на `14px`.

### Gallery

Коммит `a214e1a2` поменял precedence на `heading.size ?? headingSize`, предполагая nested-write. Dynamic Gallery config редактирует top-level `headingSize`; существующий nested legacy value затеняет видимый control.

### Collections

Renderer формирует `[--size-section-heading:24px]` динамической конкатенацией. В production preview переменная отсутствует или не попадает в compiled CSS, и заголовок остаётся на fallback `20px`.

## Chosen Design

Исправление выполняется на render boundary Rose:

1. ContactForm читает `heading.size`, затем legacy `headingSize`.
2. Gallery читает top-level `headingSize`, затем legacy `heading.size`.
3. Collections читает top-level `headingSize`.
4. Размер передаётся inline custom properties на локальной heading-wrapper; section-local CSS читает их с `!important`.
5. Mapping: small `17/12px`, medium `20/14px`, large `24/17px` для desktop/mobile. Gallery может сохранить clamp при тех же конечных значениях на 1280px.
6. Props не мигрируются и не переписываются.

Точечный renderer fix не меняет constructor state model и не отменяет global nested-precedence для секций, где панель действительно пишет nested props. Inline variables не зависят от Tailwind content scanning.

## Testing

Работа идёт по TDD:

1. Regression test сначала воспроизводит три failures.
2. Минимальный renderer fix переводит тест в green.
3. `build:theme-sections rose` подтверждает компиляцию.
4. Ближайшие Jest tests подтверждают preview prop adaptation.
5. Playwright измеряет computed font-size desktop/mobile.
6. После фактического deploy ветки live smoke меняет и восстанавливает три значения, проверяет `201` и точное восстановление props; Save/publish не используется. До deploy production smoke не запускается, потому что он проверял бы старый renderer.

## Safety

Реализация выполняется в чистом worktree `/private/tmp/merfy-sites-rose-heading-fix` на ветке `codex/fix-rose-heading-sizes`. Исходный dirty worktree не изменяется.

## Success Criteria

- Три regression cases проходят red-green цикл.
- Три секции показывают `17/20/24px` desktop и `12/14/17px` mobile.
- Gallery top-level setting больше не затеняется legacy nested value.
- Rose sections build и профильные tests проходят.
- Local compiled Playwright подтверждает computed sizes; live restore-safe cycles обязательны после deploy.
- Другие темы и dirty worktree не изменены.
