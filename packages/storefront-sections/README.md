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
| проба песочницы | `dist-render/sandbox-probe.mjs` | как у рендера; отчёт — строка журнала `render-sandbox` сборщика |

- Окружение процессов пустое, инспектор по сигналу выключен (`--disable-sigusr1`). Бинарник Node —
  `SECTION_RENDER_NODE`, пользователь ОС — `SECTION_RENDER_UID` и `SECTION_RENDER_GID` (в образе сборщика — Node 26 и
  uid 10001); без них — Node и пользователь вызывающего процесса.
- `dist-render/` собирает `pnpm build:workers`; `pnpm test`, команды `merfy` и `sections` собирают его сами.
- Пределы рендера — `RENDER_LIMITS` (`src/render.ts`): срок секции 1 с, ответ секции 1 МиБ, куча 256 МБ, RSS 512 МБ,
  свежий процесс после 200 рендеров. Отказ секции — `SectionRenderError` со стадией `render`, `render-timeout`,
  `render-output`, `render-memory` или `render-denied`: сборка пропускает такую секцию (`storefront-build`).
- Ответ процесса рендера — в дескриптор 3, рамкой `<ключ> <id> <байт>`; ключ процесс получает первой строкой stdin.
  stdout и stderr процесса никуда не идут.
- Сломанные секции для проверки руками — `fixtures/broken/`.
