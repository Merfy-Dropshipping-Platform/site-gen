# section.json

> SDK 1 · документация 1.0.0 · 2026-10-24

Ключи файла `section.json` и формы полей каждого вида. Формат хранит та же схема, по которой работает проверка при сохранении.

## Ключи

| Ключ | Что значит |
|---|---|
| `$schema` | адрес JSON Schema для подсказок редактора; проверка ключ не читает |
| `sdk` | версия SDK: 1 |
| `name` | имя секции: строчные латинские буквы и цифры через одиночный дефис |
| `kind` | вид: section или global |
| `title` | название секции в конструкторе, до 80 знаков |
| `settings` | поля секции; имя каждого — из словаря имён (names.md) |
| `blocks` | типы блоков: свои поля у каждого типа |
| `defaultBlocks` | блоки, с которыми секция появляется в конструкторе |
| `groups` | куда можно ставить секцию: header, page, footer; нет ключа — только page |
| `limit` | сколько экземпляров секции в одном списке, от 1 до 50 |
| `removable` | false — секцию нельзя удалить |
| `uses` | открывает данные: theme, shop |
| `newPage` | id поля вида string: имя новой страницы, куда ставится секция |
| `tokens` | свои токены секции; имя с меткой custom |
| `wrapper` | общие настройки секции; нет ключа — scheme и padding |
| `data` | Поля записей для `script.ts`: имя → `from` (`page.record` или `settings.<id поля с записью>`) и `fields` — публичные поля записи. В `ctx.data.<имя>` — объявленные поля или `null`. |
| `themeSettings` | сквозные настройки темы, которые читает секция: имена полей панели с пометкой "shared": true |

## Виды полей

Поле настройки — `{ "id", "label", "setting" }`; у `setting` — вид и его ключи.

| Вид | Обязательные ключи | Необязательные ключи |
|---|---|---|
| `image` | `default`, `maxBytes` | — |
| `url` | `default` | `placeholder` |
| `string` | `default` | `ai`, `inlineEdit` |
| `text` | `default` | `ai`, `inlineEdit` |
| `select` | `default`, `options` | — |
| `toggle` | `default`, `labels` | — |
| `richtext` | `default` | `inlineEdit` |
| `menu` | `default` | — |
| `image-pair` | `default`, `maxBytes` | — |
| `radio` | `default`, `options` | — |
| `range` | `default`, `min`, `max`, `step` | `unit` |
| `alignment` | `default` | — |
| `color-scheme` | `default` | — |
| `padding` | `default` | `max`, `step` |
| `product` | — | `default` |
| `collection` | — | `default` |
| `blog` | — | `default` |
| `policy` | — | `default` |
| `hint` | `title`, `text` | `default`, `link` |
