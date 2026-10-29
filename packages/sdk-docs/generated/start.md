# Как сделать секцию

> SDK 1 · документация 1.8.0 · 2026-10-29

Секция — папка с файлами: `section.json` (поля), `template.astro` (разметка) и `script.ts` — только если на странице
что-то меняется после загрузки. Секцию проверяют и сохраняют в магазин через шлюз Merfy с входом мерчанта; на витрину
она выходит, когда мерчант нажимает «Сохранить» в конструкторе.

## Порядок работы

1. Начни с [шаблона секции](template/AGENTS.md): `section.json`, `template.astro`, `AGENTS.md`, `CLAUDE.md`. Поменяй
   `name` — латиница и цифры через дефис — и `title` — название секции в конструкторе.
2. Поля — в `section.json`. Имена — только из [словаря имён](names.md), вид поля — из его столбца «Виды». Ключи
   файла и формы полей — [section.json](section-json.md).
3. Разметка — в `template.astro`: [что можно](template.md), классы — только из [словаря классов](styles.md). Как
   писать код шаблона и скрипта — [правила кода](code.md).
4. Скрипт — [script.ts](script.md), только если он нужен. Готовые поведения — [data-behavior](behaviors.md).
5. Проверь секцию — адрес «проверить» (ниже). Ответ: `ok`, `problems`, `warnings`; у проблемы — файл, строка,
   колонка, код и `doc` — ссылка на [справку по коду](errors.md) или на раздел [правил кода](code.md). Исправь место
   и проверь снова — до трёх попыток.
6. Сохрани — адрес «сохранить» с теми же файлами. `status: "accepted"` — секция в «Добавить секцию» конструктора;
   `"unchanged"` — такие файлы уже сохранены.

## Адреса

Адреса — того же шлюза, что у этой документации, с входом мерчанта (cookie сессии или токен MCP). `<магазин>` — id
магазина, `<name>` — `name` из `section.json`. Тело запросов с файлами — `{ "files": { "<путь>": "<текст>" } }`, до
512 КБ; `AGENTS.md` и `CLAUDE.md` в теле не нужны — проверка их пропускает.

| Что                            | Запрос                                                                                                   | Ответ                                                                                                                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| проверить, ничего не записывая | `POST https://gateway.merfy.ru/api/sites/<магазин>/sections/check`                                       | `{ ok, name, problems, warnings }`                                                                                                                                                            |
| сохранить черновиком           | `POST https://gateway.merfy.ru/api/sites/<магазин>/sections`                                             | то же и `status`, `id`; не прошла — 422                                                                                                                                                       |
| файлы текущей правки           | `GET https://gateway.merfy.ru/api/sites/<магазин>/sections/<name>/source`                                | `{ name, id, files }`                                                                                                                                                                         |
| правки секции                  | `GET https://gateway.merfy.ru/api/sites/<магазин>/sections/<name>/history`                               | `{ name, edits: [{ id, createdAt, draft, published, errors? }] }`; `errors` — ошибки скрипта этой правки в браузерах покупателей: `[{ stage, message, count, lastAt }]`, до трёх самых частых |
| вернуть прежнюю правку         | `POST https://gateway.merfy.ru/api/sites/<магазин>/sections/<name>/rollback` с `{ "id": "<id правки>" }` | `{ name, id, draft, published }`; роль правки занята другой секцией — 409 `role-taken`                                                                                                        |

Проверок и сохранений — до 30 в минуту на магазин; больше — ответ 429, подожди минуту.

Секция с ролью (`role` в `section.json`), у которой за 15 минут 10 и больше ошибок скрипта в браузерах покупателей,
сама возвращается к прежней опубликованной правке: в «правках секции» у неё `published: true`, у правки с ошибкой —
`published: false` и `errors`. Мерчант получает уведомление с текстом ошибки. Исправь новую правку и сохрани снова.
Секцию с той же ролью сама она возвращает не чаще раза в сутки: в эти сутки ошибка новой правки остаётся на витрине,
мерчант получает уведомление, правку исправляешь ты.

## Пример: «Подбор шарфа по цвету пальто»

Покупательница выбирает цвет пальто — в списке остаются шарфы, которые к нему подходят. Поля: заголовок и блоки
«Шарф» — название и подпись с цветами пальто. Скрипт — одно действие `pick` на кнопках пальто.

scarf-match/

```ts
import { defineSection } from '@merfy/shell';

type State = { coat: string | null };

// Кнопка пальто — действие pick: отмечает кнопку и оставляет шарфы, у которых в подписи этот цвет пальто.
export default defineSection<State>({
  actions: {
    pick(button, ctx) {
      const coat = button.attr('data-coat');
      ctx.state.coat = coat;
      for (const item of ctx.refs('coat')) item.attr('aria-pressed', String(item.attr('data-coat') === coat));
      for (const scarf of ctx.refs('scarf')) scarf.toggle(coat === null || (scarf.attr('data-coats') ?? '').includes(coat));
    },
  },
});

```

```json
{
  "sdk": 1,
  "name": "scarf-match",
  "kind": "section",
  "title": "Подбор шарфа по цвету пальто",
  "settings": [
    { "id": "heading", "label": "Заголовок", "setting": { "kind": "string", "default": "Подберите шарф к пальто" } }
  ],
  "blocks": {
    "scarf": {
      "title": "Шарф",
      "limit": 12,
      "settings": [
        { "id": "label", "label": "Название", "setting": { "kind": "string", "default": "Кашемировый шарф" } },
        { "id": "caption", "label": "К каким пальто", "setting": { "kind": "string", "default": "серое, чёрное" } }
      ]
    }
  },
  "defaultBlocks": [
    { "type": "scarf", "settings": { "label": "Шарф цвета кэмел", "caption": "серое, чёрное" } },
    { "type": "scarf", "settings": { "label": "Графитовый шарф", "caption": "бежевое" } },
    { "type": "scarf", "settings": { "label": "Молочный шарф", "caption": "чёрное, бежевое" } }
  ]
}

```

```astro
---
const { settings, blocks } = Astro.props;
---
<div class="mx-auto flex max-w-page flex-col gap-4 px-4 font-body">
  {settings.heading && <h2 class="m-0 font-heading weight-heading text-3xl text-heading">{settings.heading}</h2>}
  <div class="flex gap-4">
    <button type="button" class="rounded-button bg-primary px-4 py-2 text-primary-foreground" data-ref="coat" data-coat="серое" data-action="pick">Серое пальто</button>
    <button type="button" class="rounded-button bg-primary px-4 py-2 text-primary-foreground" data-ref="coat" data-coat="чёрное" data-action="pick">Чёрное пальто</button>
    <button type="button" class="rounded-button bg-primary px-4 py-2 text-primary-foreground" data-ref="coat" data-coat="бежевое" data-action="pick">Бежевое пальто</button>
  </div>
  <div class="flex flex-col gap-4">
    {blocks.map((block) => (
      <div class="rounded-button bg-card p-4 text-card-foreground" data-ref="scarf" data-coats={block.settings.caption}>
        <p class="m-0 text-lg">{block.settings.label}</p>
        <p class="m-0 mt-2">К пальто: {block.settings.caption}</p>
      </div>
    ))}
  </div>
</div>

```

## Пример ошибки

Поле `title` — не из словаря. Проверка отвечает `section.json:… — поле «title»: имени нет в словаре; ближе всего —
heading [setting-name-unknown]`; исправление — `"id": "heading"` и `{settings.heading}` в шаблоне.

bad-setting-name-unknown/

```json
{
  "sdk": 1,
  "name": "reviews-wall",
  "kind": "section",
  "title": "Стена отзывов",
  "settings": [{ "id": "title", "label": "Заголовок", "setting": { "kind": "string", "default": "Отзывы" } }]
}

```

```astro
---
const { settings } = Astro.props;
---
<div class="mx-auto max-w-page px-4 font-body"><h2 class="m-0 text-3xl text-heading">{settings.title}</h2></div>

```

