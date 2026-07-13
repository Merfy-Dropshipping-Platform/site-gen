# Publications Preview/Live Parity — Design

## Goal

Устранить подтверждённое расхождение секции Publications темы Rose: один и тот
же сохранённый revision должен давать одинаковое число карточек и колонок в
горячем preview конструктора, серверном preview и опубликованном storefront.

Первая волна ограничена Publications. После её production-проверки тот же
подход можно последовательно применить к остальным секциям из QA-отчёта.

## Confirmed Failure

В проверенном revision одновременно сохранены две пары счётчиков:

- legacy/render-contract: `cards = 3`, `columns = 3`;
- текущие поля панели: `cardsCount = 5`, `columnsCount = 4`.

Figma разрешает для обеих настроек диапазон `1..4`. Preview показывает четыре
карточки, а live — три. На mobile это даёт расхождение высоты секции примерно
на одну карточку.

## Root Cause

Панель конструктора показывает и изменяет `cardsCount/columnsCount`, но
`cards/columns` остаются обязательными скрытыми props с собственными defaults.
При сохранении одного видимого поля обе пары могут разойтись.

Текущий stored normalizer нормализует пары независимо: он умеет clamp-ить
невалидные значения, но не выбирает одно effective value и не синхронизирует
alias-поля. Renderer тоже самостоятельно выбирает fallback. В результате
revision содержит несколько равноправных ответов на один вопрос.

## Considered Approaches

### 1. Исправить только панель конструктора

При каждом изменении записывать одинаковые значения в обе пары полей.

Плюс: минимальное изменение UI. Минус: уже сохранённые conflicting revisions
продолжили бы рендериться неоднозначно до следующего ручного редактирования.

### 2. Исправить только Publications.astro

Задать renderer-у явный приоритет `cardsCount/columnsCount`.

Плюс: быстро исправляет конкретную секцию. Минус: не устраняет конфликт в
данных, оставляет другие preview/live boundaries зависимыми от своих fallback
правил и позволяет панели снова записать конфликт.

### 3. Канонизация на render boundary и при сохранении — выбранный вариант

Ввести один deterministic contract выбора effective values, применять его к
старым revisions перед preview/live и материализовать тот же результат при
следующем изменении секции в constructor.

Этот вариант исправляет существующие данные без массовой DB-миграции и не
позволяет конфликту появляться снова.

## Canonical Data Contract

Для Publications:

1. `cardsCount` и `columnsCount` — текущие пользовательские поля и имеют
   приоритет, если значение присутствует.
2. `cards` и `columns` — legacy/render aliases и используются только как
   fallback для старых revisions.
3. Effective value приводится к целому числу и ограничивается диапазоном
   `1..4`; fallback равен `3`.
4. После нормализации обе пары содержат один результат:
   `cards === cardsCount`, `columns === columnsCount`.
5. Нормализация идемпотентна: повторный вызов не меняет результат.
6. Остальные существующие правила сохраняются: `publicationType` имеет
   приоритет над `categoryFilter`, `showDateTime` — над `dateTime.enabled`.

Примеры:

| Input | Effective output |
| --- | --- |
| `cards=2`, без `cardsCount` | `cards=2`, `cardsCount=2` |
| `cards=3`, `cardsCount=4` | `cards=4`, `cardsCount=4` |
| `cards=3`, `cardsCount=5` | `cards=4`, `cardsCount=4` |
| нет обеих пар | обе пары равны `3` |

## Integration

### Sites/theme-base

- Stored normalizer Publications вычисляет effective counts один раз и
  синхронизирует aliases.
- `adaptLegacyProps` получает отдельную ветку Publications вместо generic-only
  обработки и применяет тот же precedence перед возвратом blocks.
- `extractPageBlocks` остаётся общей границей серверного preview и live, поэтому
  оба pipeline получают одинаковые props.
- Astro renderer использует уже нормализованный effective value и сохраняет
  защитный clamp для прямого block-preview, который обходит page extraction.

### Constructor

- При любом изменении Publications панель вычисляет effective counts по тому же
  precedence и записывает обе пары синхронно.
- Изменение slider немедленно обновляет его alias; unrelated edit также
  канонизирует старый conflicting revision.
- Формат API и структура revision не меняются.

## Compatibility and Safety

- Массовая миграция БД не выполняется.
- Legacy-only revisions сохраняют прежний вид.
- Для conflicting revisions текущие видимые значения панели считаются
  намерением пользователя; это соответствует текущему UI и Figma.
- Значения вне `1..4` не отклоняют всю секцию, а безопасно clamp-ятся.
- Upload limits, публикация сайта и остальные секции не входят в эту волну.

## Testing

Работа выполняется по TDD.

1. Pure tests: current-only, legacy-only, conflicting aliases, invalid values,
   defaults и idempotence.
2. Sites integration test: `extractPageBlocks` возвращает синхронные pairs для
   одного revision и для preview/live consumers не требуется отдельная логика.
3. Renderer contract: число карточек и desktop-колонок использует effective
   counts, mobile остаётся одной колонкой.
4. Constructor regression: при slider edit и unrelated edit сохраняются
   `cards === cardsCount` и `columns === columnsCount`.
5. Профильные Jest/Vitest tests и сборка затронутого блока.
6. После deploy Playwright проверяет тот же сайт на desktop и mobile:
   sidebar value, DOM card count, grid columns, screenshots, console/network
   errors и одинаковый результат preview/live.

## Baseline

На чистом `origin/main` до изменений полные suites уже имеют unrelated failures:

- constructor: 118/120 tests passed; два assertion failures и два suite errors;
- sites: 854/865 tests passed, 75/81 suites passed.

Профильный constructor `figmaSectionContract` проходит. Новая работа не должна
увеличить baseline failures; acceptance опирается на новые targeted tests и
сравнение полного suite с зафиксированным baseline.

## Success Criteria

- Конфликт `cards=3`, `cardsCount=5` везде даёт четыре карточки.
- Preview и live получают идентичные normalized Publications props.
- Любое последующее изменение секции устраняет divergent aliases в revision.
- Диапазон Figma `1..4` соблюдается на desktop и mobile.
- Новые targeted tests проходят, а полный test baseline не ухудшается.
