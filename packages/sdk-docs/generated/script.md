# script.ts

> SDK 1 · документация 1.20.0 · 2026-10-30

`script.ts` — поведение секции в браузере. Нужен, только если на странице что-то меняется после загрузки: выбор,
фильтр, счётчик. Открыть, переключить, прокрутить — готовые [поведения](behaviors.md) без скрипта.

## Определение секции

```ts
import { defineSection } from '@merfy/shell';

type State = { coat: string | null };

export default defineSection<State>({
  mount(el, ctx) {
    ctx.ref('count')?.text(ctx.refs('item').length);
  },
  actions: {
    pick(button, ctx) {
      ctx.state.coat = button.attr('data-coat');
    },
  },
});
```

- `mount(el, ctx)` — секция появилась на странице; `unmount(el, ctx)` — убрана.
- `actions` — действия по `data-action="<имя>"` элемента: клик по кнопке или ссылке, отправка формы. Аргументы — элемент
  `El` и `ctx`. Действия SDK (`cart.add` и другие) — [actions.md](actions.md), их можно вызывать без скрипта.
- Импорт — только `@merfy/shell` и свои файлы `.ts`/`.js` секции.
- `window`, `document`, `fetch`, `setTimeout`, `localStorage` — нельзя: всё через `ctx`.

## ctx

| Член | Что делает |
|---|---|
| `ctx.state` | состояние экземпляра секции; переживает замену секции в превью |
| `ctx.ref(name)` | элемент `data-ref="<name>"` внутри секции или `null` |
| `ctx.refs(name)` | все элементы `data-ref="<name>"` |
| `ctx.on(target, type, fn)` | событие `window` или `document` (прокрутка, клавиши); снимается само |
| `ctx.every(ms, fn)` | повтор раз в `ms` (не чаще 100 мс); снимается сам |
| `ctx.after(ms, fn)` | один раз через `ms` |
| `ctx.watch(store, fn)` | подписка на стор модуля SDK: сразу текущее значение, потом каждое новое |
| `ctx.listen(name, fn)` | событие витрины `merfy:…` ([events.md](events.md)) |
| `ctx.emit(name, detail)` | своё событие секции, уходит как `<имя секции>:<name>` |
| `ctx.log(...values)` | в превью — в консоль с именем секции; на витрине — ничего |
| `ctx.animate(el, keyframes, options)` | анимация элемента |
| `ctx.storage` | хранилище секции в браузере: `get`, `set` (до 4 КБ), `remove` |

## El

| Член | Что делает |
|---|---|
| `text()` / `text(value)` | текст элемента |
| `attr(name)` / `attr(name, value)` | атрибут; `null` — убрать |
| `hasClass(name)` / `toggleClass(name, on)` | класс словаря |
| `show()` / `hide()` / `toggle(on)` / `visible()` | показать и скрыть — атрибут `hidden`. Элемент, скрытый при загрузке (сообщение «Спасибо», ошибка), — с атрибутом `hidden`, не классом `hidden`: класс `show()` не снимает |
| `value()` / `checked()` / `form()` | поля формы |
| `cssVar(name, value)` | переменная CSS элемента |
| `ref(name)` / `refs(name)` / `closest(name)` | элементы `data-ref` внутри и снаружи |
| `list(items, fill)` | список по шаблону первого ребёнка |
| `focus()` | фокус |

Модули SDK по `uses` — корзина, избранное, кто вошёл (`customer`), вход и кабинет (`auth`) — [modules.md](modules.md).

Подписка на рассылку — `ctx.newsletter.subscribe({ email })` из скрипта. Тексты ответов — как у пяти тем: `ok` и
`alreadySubscribed: false` — «Спасибо! Мы отправим вам приветственное письмо.», `alreadySubscribed: true` —
«Вы уже подписаны на рассылку.», отказ с кодом `limit` (не больше 5 запросов за 5 минут с одного адреса) —
«Слишком много попыток. Попробуйте позже.».

Файлы покупательницы для форм расширений — модуль `files`: `ctx.files.chosen(поле)` — файлы `<input type="file">`
(ключ, имя, размер, тип, картинка ли), `ctx.files.upload({ key, extension, kind })` — загрузка в хранилище расширения
(`kind` — `photo`, `video`, `file`; ответ `ready` с `fileId` или `rejected` с причиной `format`, `size`, `empty`),
`ctx.files.preview(img, key)` и `ctx.files.forget(key)` — превью картинки и отказ от файла. В превью файлов нет.

«Поделиться» страницей — модуль `share`: `ctx.share.page()` открывает окно «Поделиться» системы с названием и адресом
страницы, а там, где окна нет, копирует адрес в буфер обмена; ответ `{ method: "share" }` или `{ method: "copy" }`.
Закрытое без выбора окно — не ошибка. Кнопке в разметке хватает `data-action="share.page"`; что показать после
копирования («Ссылка скопирована»), решает секция по `method`.

