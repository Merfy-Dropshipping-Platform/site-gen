# Rose Section Settings Batch — Design

## Goal

Исправить четыре подтверждённых расхождения между настройками конструктора и
рендерингом темы Rose:

- legacy-слайды без `position` должны сохранять исторический центрированный вид;
- размеры заголовка и текста рассылки Footer должны влиять на страницу;
- варианты кнопки MultiRows должны иметь единый канонический контракт и не ломать
  сохранённое legacy-значение `secondary`;
- значение `thin` PromoBanner должно рендерить тонкую полосу, а не fallback `large`.

## Scope

Изменения ограничены:

- Rose renderers `Slideshow`, `Footer`, `MultiRows`, `PromoBanner`;
- конфигурацией MultiRows только если это необходимо для единого контракта;
- небольшими pure helpers/maps, если они нужны для тестирования;
- точечными regression-тестами и Playwright-проверкой desktop/mobile.

Не входят миграция или массовая перезапись ревизий, публикация пользовательского
сайта, изменение остальных тем и исправление других findings аудита.

## Root Causes

### Slideshow

`defaultItemProps.position` равен `center`, но Rose renderer превращает отсутствующее
значение legacy-слайда в пустую строку, которая попадает в ветку `justify-end`.

### Footer

Схема и панель сохраняют `heading.size` и `text.size`, но Rose renderer использует
захардкоженные `20px` и `16px` и читает из props только содержимое.

### MultiRows

Каноническая схема содержит `primary / black / white`, тогда как ранее сохранённое
или отданное старой панелью значение `secondary` не имеет явной нормализации.
Renderer фактически различает только белую и основную тёмную кнопку.

### PromoBanner

Общая схема разрешает `thin`, но локальная Rose `SIZE_MAP` содержит только
`small / medium / large`. Неизвестное значение откатывается к `large`.

## Chosen Design

Исправление выполняется на render boundary без миграции данных:

1. Slideshow нормализует отсутствующий или невалидный `position` в `center`.
2. Footer применяет явные статические mappings: заголовок `17 / 20 / 24px`, текст
   `14 / 15 / 16px` для `small / medium / large`. Отсутствующее/невалидное
   значение сохраняет текущий визуальный default `20px / 16px`.
3. MultiRows сохраняет канон `primary / black / white`; legacy `secondary`
   нормализуется в `white`. `primary` и `black` остаются визуально тёмными, пока
   тема не задаёт отдельную primary-манеру.
4. PromoBanner добавляет `thin` в локальный mapping как полосу `32px` с текстом
   `12px`, согласованную с минимальным размером Rose. Остальные размеры не меняются.
5. Все mappings задаются статическими Tailwind-строками или pure constants, чтобы
   production build гарантированно включал классы.

## Compatibility

- Формат props и Zod-схемы не меняются.
- Старые ревизии не переписываются.
- Slideshow получает безопасный legacy fallback.
- MultiRows продолжает отображать старое `secondary`, но при следующем выборе
  панель сохраняет только канонические значения.
- Неизвестные значения остальных настроек используют прежние defaults.

## Testing

Работа идёт по TDD:

1. Regression-тесты сначала фиксируют четыре текущих failure.
2. Минимальные renderer/config изменения переводят тесты в green.
3. Запускаются профильные Vitest/Jest tests и сборка секций Rose.
4. Локальный Playwright проверяет каждое значение на desktop и mobile, включая
   computed styles и отсутствие layout overflow.
5. После deploy production smoke меняет значения через constructor, делает
   screenshots и точно восстанавливает исходные props; Save/Publish не нажимается.

## Safety

Работа выполняется в чистом worktree
`/private/tmp/merfy-sites-rose-heading-fix`. Dirty основной worktree не изменяется.
Перед реализацией создаётся отдельная ветка `codex/fix-rose-section-settings-batch`.

## Success Criteria

- Legacy Slideshow без `position` центрирован.
- Все три Footer heading/text size дают различимые computed размеры по mapping.
- MultiRows корректно отображает три канонических варианта и legacy `secondary`.
- PromoBanner `thin` имеет высоту `32px`, не `48px`.
- Профильные тесты и Rose build проходят.
- Playwright подтверждает поведение на desktop/mobile без новых визуальных поломок.
