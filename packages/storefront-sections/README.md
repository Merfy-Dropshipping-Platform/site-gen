# @merfy/storefront-sections

Приём кода секций (блок 7 «Каркаса витрины», `merfy-mcp/docs/plans/storefront-shell/07-sdk-shell/design.md`): одна
функция приёма для своих секций магазина и секций расширений (С7-11 А, п. 21) и общая таблица секций
с историей правок (С7-10 Б, С7-20 Б).

## Формат секции (п. 20)

Папка: `section.json`, `template.html`, `styles.css`, `script.ts` или `script.js` и его файлы `.ts`/`.js`.

```json
{ "v": 1, "name": "scarf-colors", "kind": "section", "title": "Цвета шарфа", "fields": [] }
```

- `kind`: `section` — секция с местом на странице; `global` — глобальный скрипт без места (С7-21 А): без шаблона и
  стилей, со скриптом.
- `fields` — поля настроек по схеме блока 8 (п. 23); до схемы хранятся как есть.
- Скрипт необязателен (п. 16). Импорт — только `@merfy/shell` и свои файлы; нужен `export default defineSection(…)`.
- Стили получают рамку `merfy-section[data-section="<имя>"]`; `:scope` — сама обёртка. `html`, `body`, `:root`,
  `@import`, `@font-face` — отказ; цвет мимо токенов — предупреждение.

## Способы сохранения (п. 21, 22, 24)

Секций платформы и тем нет (блок 1 «Секций и SDK», пп. 1, 2): наши секции магазин сохраняет как свои.

| Способ | Когда | Префикс | Выпуск |
|---|---|---|---|
| своя секция | `pnpm sections accept --shop` (потом — конструктор и MCP) | `shop:` | — (черновик → публикация) |
| расширение | `pnpm sections accept --extension` (потом — регистрация версии) | `<id расширения>:` | версия расширения |

## Команды

- `pnpm test`, `pnpm test:coverage` — без базы; `pnpm test:stack` — на стенде сборщика (Postgres, MinIO).
- `pnpm sections accept|history|rollback|publish` — сохранение секции, история своей секции и публикация своих секций
  магазина без сборки из командной строки (задача 10; `publish` — блок 1 «Секций и SDK»).

## Процессы проверки и рендера (блок 2 «Секций и SDK»)

Код секции выполняется только в отдельных процессах Node под моделью разрешений (`src/isolation.ts`):

| Процесс | Файл | Права |
|---|---|---|
| проверка при сохранении | `dist-render/check-worker.mjs` (`src/worker.ts`) | `--permission`, чтение папки процесса, `node_modules` и хранилища pnpm, `--allow-wasi`: компилятор Astro WASI и браузерная сборка `esbuild-wasm`; чужой JS не исполняет |
| рендер секций | `dist-render/render-worker.mjs` | `--permission`, чтение тех же папок; без сети (Node 26), дочерних процессов, потоков, аддонов и WASI |
| проба песочницы | `dist-render/sandbox-probe.mjs` | как у рендера; пробует и сигнал соседнему процессу рендера (`neighbour`); отчёт — строка журнала `render-sandbox` сборщика |

- Окружение процессов пустое, инспектор по сигналу выключен (`--disable-sigusr1`). Бинарник Node —
  `SECTION_RENDER_NODE`. Пользователь ОС у каждого живого процесса свой (`UserPool`, `src/isolation.ts`): uid из
  диапазона `SECTION_RENDER_UID_FIRST` и `SECTION_RENDER_UID_COUNT`, группа — `SECTION_RENDER_GID` (в образе сборщика —
  Node 26, uid 10001–11000, группа 10001). Сигнал процессу другого магазина ядро не пропускает (`EPERM`). Без этих
  переменных — Node и пользователь вызывающего процесса.
- `dist-render/` собирает `pnpm build:workers`; `pnpm test`, команды `merfy` и `sections` собирают его сами.
- Пределы рендера — `RENDER_LIMITS` (`src/render.ts`): срок секции 1 с, ответ секции 1 МиБ, куча 256 МБ, RSS 512 МБ,
  свежий процесс после 200 рендеров. Отказ секции — `SectionRenderError` со стадией `render`, `render-timeout`,
  `render-output`, `render-memory` или `render-denied`: сборка пропускает такую секцию (`storefront-build`).
- Ответ процесса рендера — в дескриптор 3, рамкой `<ключ> <id> <байт>`; ключ процесс получает первой строкой stdin.
  stdout и stderr процесса никуда не идут.
- Сломанные секции для проверки руками — `fixtures/broken/`.

## Правила полей секции (блок 3 «Секций и SDK»)

- Имя поля — из словаря `names.json`, вид поля — из `kinds` этого имени. Имя не из словаря — `setting-name-unknown`:
  ближайшее имя, подсказка из `not-names.json` или настройка «Настроек темы» (`generated/shared-settings.json` — поля
  панели темы с `"shared": true`; секция читает их через `"uses": ["theme"]`). Вид не из `kinds` — `setting-name-kind`.
- Лимиты — `SETTINGS_LIMITS` (`src/limits.ts`): 20 полей у секции, 10 у типа блока, 6 типов блоков, сумма `limit` 50,
  вариантов 2–10, подписи до 32 знаков, `sublabel` до 120; отказ `settings-limit`.
- Условие показа — поле своего списка вида `toggle`, `select`, `radio` или `alignment`, значение из его значений,
  цепочка до двух переходов, без кругов; отказ `visible-when-invalid`.
- Второй пробный рендер — с пустыми строками, текстами, адресами и картинками, без блоков; исключение —
  `render-empty-failed`.
- Место ошибки — строка и колонка значения в `section.json` (`jsonc-parser`; в процессе проверки — внешний модуль).
- `pnpm generate` пишет `generated/`: `section.schema.json` (для `"$schema"` в `section.json`), `names.schema.json`,
  `NAMES.md`, `shared-settings.json`; тест сверяет их с генерацией. Поменял словарь, формат секции или пометки
  `shared` в панели темы — запусти `pnpm generate`.
- `pnpm merfy section names` — словарь текстом `NAMES.md`.
- Секция с ошибкой на каждое правило — `fixtures/broken/fields-broken`.

## Стили секции (блок 4 «Секций и SDK»)

Своего CSS у секции нет: только классы Tailwind из словаря `@merfy/tokens` и свои токены секции.

- **Шаг «Классы»** при сохранении (`src/classes.ts`): классы атрибутов `class` и `class:list` — строки, обе ветки
  `?:`, ключи объектов; в шаблонной строке — значения полей `select` и `toggle`. Ошибки: `class-unknown` (Tailwind со
  словарём не знает класс; в подсказке — семейство словаря и близкие имена), `class-arbitrary` (`[…]`, `(…)`, `!`;
  варианты `data-[…]` и `aria-[…]` можно), `class-dark` (тёмный вид — схема цвета), `class-theme-token` (свой токен темы
  — только у одной темы), `class-dynamic` (класс из поля без конечного набора значений).
- **Токены секции** — `section.json` → `tokens`: та же запись, что в словаре; имя с меткой `custom` (`custom-swatch`,
  `radius-custom-swatch`), до 10, значение — `default` или `alias` от токена словаря того же вида. Ошибка —
  `token-invalid`. Класс токена — как у словаря: `bg-custom-swatch`, `rounded-custom-swatch`.
- **Значения на странице** — `@layer base { merfy-section[data-section="<имя>"] { --<токен>: … } }` в CSS токенов
  магазина; правка мерчанта — `revision.tokens.sections`, одно значение на магазин.
- **База страницы** — `@merfy/tokens/base.css` (preflight и база словаря в `@layer base`), первым стилем головы.
