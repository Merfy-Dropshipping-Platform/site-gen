# Шпаргалка: секция с нуля

> SDK 1 · документация 1.21.0 · 2026-10-30

Шпаргалка: как написать секцию с нуля и не открывать остальные файлы. Подробности — по ссылкам внизу; каждый абзац ниже
сверен с проверкой при сохранении.

## Порядок

1. Реши вид: что секция показывает и что из этого мерчант захочет менять — это параметры.
2. `section.json` — поля; `template.astro` — разметка, которая только выводит `{settings.<имя>}`; `script.ts` — только если
   после загрузки что-то меняется.
3. Проверь (`merfy_sections check` или `POST /api/sites/<магазин>/sections/check`), исправь по ответу, сохрани.
   Ответ: `problems` — отказ, `warnings` — секция сохраняется, но стоит поправить.

## Минимум

```json
{
  "sdk": 1, "name": "benefits", "kind": "section", "title": "Преимущества",
  "settings": [
    { "id": "heading", "label": "Заголовок", "setting": { "kind": "string", "default": "Почему мы" } }
  ],
  "blocks": {
    "item": { "title": "Пункт", "limit": 6, "settings": [
      { "id": "text", "label": "Текст", "setting": { "kind": "text", "default": "Доставка за день" } }
    ] }
  },
  "defaultBlocks": [{ "type": "item", "settings": { "text": "Доставка за день" } }]
}
```

```astro
---
const { settings, blocks } = Astro.props;
---
<div class="mx-auto flex max-w-page flex-col gap-4 px-4 font-body">
  {settings.heading && <h2 class="m-0 font-heading weight-heading text-3xl text-heading">{settings.heading}</h2>}
  {blocks.map((block) => <p class="m-0 text-foreground">{block.settings.text}</p>)}
</div>
```

## Параметры: что вынести

Мерчант захочет выключить или поменять — параметр: надписи, картинки, ссылки, колонки, линия, регистр, автопрокрутка.
Текст и адрес картинки в разметке — не параметр, мерчант их не поменяет (предупреждения `taste-literal-text`,
`taste-literal-image`). Поле, которого шаблон не читает, — `taste-dead-setting`: после переделки убери лишние.

- Виды поля: `string`, `text`, `richtext`, `url`, `image`, `image-pair`, `video`, `select`, `radio`, `toggle`, `range`,
  `alignment`, `color-scheme`, `padding`, `menu`, `product`, `collection`, `blog`, `policy`, `hint`. Обязательные ключи:
  `default` у всех, кроме `product`/`collection`/`blog`/`policy`/`hint`; `maxBytes` у `image`, `image-pair`, `video`;
  `options` у `select`/`radio`; `labels` `{ "on", "off" }` у `toggle`; `min`, `max`, `step` у `range`
  ([section-json.md](section-json.md)).
- `settings` — ссылка `{ "wrapper": "padding" }` ставит общие «Отступы» и «Цветовую схему» (по умолчанию они уже есть).
- Условия: `visibleWhen` и `disabledWhen` — `{ "setting": "<id>", "equals": <значение> }` по полю `toggle`, `select`,
  `radio`, `alignment` своего списка.
- `blocks`: до 8 типов, до 50 блоков; `limit` — сколько блоков типа; в блоке нет видов `blog`, `policy`, `menu`.
- `uses`: `["theme"]`, `["shop"]` открывают `theme` и `shop` в шаблоне; `groups`: `header`, `page`, `footer` — куда ставить.

## Имена полей

Имя поля — kebab-case из словаря, вид — из его столбца «Виды». Не из словаря — отказ `setting-name-unknown`, ответ
называет до трёх ближайших имён. Искать имя: `merfy_sections action=names find="<слово>"` (до шести записей); весь
словарь — [names.md](names.md) (около 19 тыс. знаков, целиком не читай) и данные [names.json](names.json). Нет
подходящего — своё имя в `names` секции (до 12): `{ "sku-label": { "kinds": ["string"], "label": "Артикул", "about":
"Подпись артикула", "asks": ["артикул"] } }`. Нельзя имена `show-*`, `hide-*`, `variant`, `color`, `font`, `margin`,
`gap` и другие из раздела «Нет в словаре» ([names.md](names.md)).

## Шаблон

- Frontmatter — одна строка `const { settings, blocks } = Astro.props;` (`theme` и `shop` — только с `uses`).
  Операторов, `import`, функций и переменных нет.
- Можно: `{settings.x}`, `{settings['kebab-id']}`, `&&`, `?:` (не вложенный), `blocks.map(...)`, `class:list`,
  `data-*`, `set:html` — только у `richtext` и у `string`/`text` с `"ai"`; HTML-текст — в элементе с классом `rich-text`.
- Нельзя: `<script>`, `<style>`, `<iframe>`, `<link>`, `<meta>`, `<title>` и другие служебные теги, компоненты, `on…`-обработчики, `javascript:`,
  `{...}` в атрибутах, атрибут `style`, `Date`, `Intl`, префикс `__merfy`.
- Любое поле мерчант может стереть: `{settings.heading && <h2>…</h2>}`. Деньги — объект: `{price.text}`, не `{price}`
  (`render-leak`). Один `<h1>` на странице, у поля формы — `<label>`.
- Условия: вложенный `?:`, четыре и больше частей через `&&`/`||`, ветка на каждое значение поля в `class:list` и
  одно условие в трёх местах — предупреждения `taste-*`; вместо этого `data-<поле>={…}` на предке и варианты
  `data-[поле=значение]:` и `in-data-[…]:` у потомков ([code.md](code.md)).

## Классы и токены

Своего CSS нет: только классы Tailwind из словаря ([styles.md](styles.md)). Цвета, шрифты, радиусы — токены:
`bg-primary`, `text-heading`, `text-foreground`, `font-body`, `font-heading weight-heading`, `rounded-button`,
`rounded-card`, `max-w-page`. Нельзя: произвольные значения `bg-[#c9a227]`, `dark:`, класс из строки
(`class-dynamic`), токены одной темы. Нужен свой цвет — `tokens` в `section.json` с меткой `custom`. Градиент —
направление и точки на одном элементе (`bg-linear-to-r from-… to-…`), иначе `class-inert`. Вёрстка телефоном
вперёд: классы без префикса — телефон, `md:` и `lg:` добавляют; кнопки от `h-11`, без прокрутки вбок.

## Частые приёмы

Включатель (`toggle`) и выбор (`select`) меняют вид без веток в разметке: значение — в `data-*`, классы — вариантами.
Картинка и кнопка исчезают, когда поле пустое.

```astro
<section class="mx-auto max-w-page px-4" data-capitals={settings.capitals}>
  {settings.image && <img src={settings.image} alt="" class="aspect-4/5 w-full object-cover" />}
  <h2 class="m-0 text-heading in-data-[capitals=true]:uppercase">{settings.heading}</h2>
  {settings['button-label'] && (
    <a href={settings['button-link']} class="inline-flex h-11 items-center rounded-button bg-primary px-6 text-primary-foreground">
      {settings['button-label']}
    </a>
  )}
</section>
```

## Данные

- `settings.<id>` — значения полей; `blocks[i].settings.<id>` — поля блока.
- Поля `product`, `collection`, `blog`, `policy` дают запись или `null`: у товара `title`, `url`, `price`, `compareAtPrice`,
  `images`, `available`, `preorder` (под заказ: остатка нет, заказ разрешён), `options`, `variants`; у коллекции
  `products` (карточки до 24). Скрипту записи отдаёт `data` в `section.json` ([data.md](data.md)).
- `theme` — сквозные настройки темы (`uses: ["theme"]`), `shop` — публичные данные магазина: название, контакты, адрес
  (`uses: ["shop"]`).

## Скрипт и готовое поведение

Сначала без скрипта: `data-behavior` — `accordion`, `dialog`, `carousel`, `tabs`, `nav-menu`, `quantity`, `card-photos`,
`sticky-header`, `video`, `catalog`, `search`, `zoom` с частями `data-part` ([behaviors.md](behaviors.md)); появление —
`data-animate`; действия SDK — `data-action="cart.add"`, `favorites.toggle` и другие ([actions.md](actions.md)).

Свой скрипт — `export default defineSection({ mount(el, ctx) {}, actions: { имя(button, ctx) {} } })`, импорт только
`@merfy/shell` и свои `.ts`. Нельзя `window`, `document`, `fetch`, `setTimeout`: всё через `ctx` (`ref`, `refs`, `on`,
`every`, `watch`, `listen`, `state`, `storage`); элемент `El` — `text`, `attr`, `toggleClass`, `show`, `hide`, `value`
([script.md](script.md)). Модули — `uses` ([modules.md](modules.md)).

## Пределы

Файлов до 50, файл до 64 КБ, все вместе до 256 КБ; полей секции до 20, блока до 16; вариантов списка от 2 до 10;
подпись до 32 знаков; скрипт после сжатия до 50 КБ; проверка до 10 с ([limits.md](limits.md)). Проверок и сохранений —
до 30 в минуту на магазин.

## Дальше

[start.md](start.md) — адреса и разобранный пример · [anatomy.md](anatomy.md) — как связаны файлы · [errors.md](errors.md)
— справка по кодам проверки · [template.md](template.md) · [section-json.md](section-json.md) · [events.md](events.md).

