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
| `ctx.on(target, type, fn)` | событие `window` или `document` (прокрутка, клавиши, нажатие; положение курсора — `pointermove`, [motion.md](motion.md#курсор)); снимается само |
| `ctx.every(ms, fn)` | повтор раз в `ms` (не чаще 100 мс); снимается сам |
| `ctx.after(ms, fn)` | один раз через `ms` |
| `ctx.watch(store, fn)` | подписка на стор модуля SDK: сразу текущее значение, потом каждое новое |
| `ctx.listen(name, fn)` | событие витрины `merfy:…` ([events.md](events.md)) |
| `ctx.emit(name, detail)` | своё событие секции, уходит как `<имя секции>:<name>` |
| `ctx.log(...values)` | в превью — в консоль с именем секции; на витрине — ничего |
| `ctx.animate(el, keyframes, options)` | анимация элемента или списка: свойства, миллисекунды, кривые и пружина, `stagger`, повтор, `finished` и `stop`, рецепты — [motion.md](motion.md#ctxanimate) |
| `ctx.split(el, by)` | текст элемента на буквы, слова или строки для `ctx.animate` — [motion.md](motion.md#ctxsplit) |
| `ctx.scroll(target, анимация \| fn, options)` | анимация или прогресс 0…1 от прокрутки, закреплённые секции — [motion.md](motion.md#ctxscroll) |
| `ctx.inView(el, fn, options)` | своя анимация при входе элемента в экран — [motion.md](motion.md#ctxinview) |
| `ctx.lib.motion` | полный Motion из `uses: ["lib:motion"]`: `timeline`, `tween`, `animate` — [motion.md](motion.md#полный-motion-libmotion) |
| `ctx.page` | адрес страницы: `path` и `query`; с `"uses": ["page"]` — ещё сторы `$scroll`, `$leaving`, `$now` — [страница целиком](#страница-целиком) |
| `ctx.storage` | хранилище секции в браузере: `get`, `set` (до 4 КБ), `remove` |
| `ctx.ext.<id>` | расширение из `uses: ["ext:<id>"]`: сторы `$имя` и методы `имя(input)` — [вызов функции расширения](#вызов-функции-расширения) |
| `ctx.behavior(name, el?)` | команды готового поведения своей разметки: открыть пункт аккордеона, листнуть слайдер, показать окно поверх экрана — [поведения из скрипта секции](#поведения-из-скрипта-секции) |
| `ctx.overlay` | **устарело** (с 03.11): окно секции, принятой с группой `overlay`: `open(options)`, `close()`, стор `$open` — [окно поверх страницы](#окно-поверх-страницы); у остальных секций — `null`. Новое окно — `ctx.behavior('dialog')` |
| `ctx.stores['<префикс>:<имя>']` | свой стор из `uses: ["store:<префикс>:<имя>"]`, только для чтения через `ctx.watch` — [stores.md](stores.md) |

## El

| Член | Что делает |
|---|---|
| `text()` / `text(value)` | текст элемента |
| `attr(name)` / `attr(name, value)` | атрибут; `null` — убрать. Читать можно любой, писать — только из [списка ниже](#цвет-и-размер-из-данных) |
| `hasClass(name)` / `toggleClass(name, on)` | класс словаря |
| `show()` / `hide()` / `toggle(on)` / `visible()` | показать и скрыть — атрибут `hidden`. Элемент, скрытый при загрузке (сообщение «Спасибо», ошибка), — с атрибутом `hidden`, не классом `hidden`: класс `show()` не снимает |
| `value()` / `checked()` / `form()` | поля формы |
| `cssVar(name, value)` | переменная CSS элемента: `cssVar('pick-bg', '#c9a227')` пишет `--pick-bg`; `null` — убрать; работает и у SVG-элемента (`rect`, `svg`). Цвет и размер из данных — [через неё](#цвет-и-размер-из-данных) |
| `ref(name)` / `refs(name)` / `closest(name)` | элементы `data-ref` внутри и снаружи |
| `list(items, fill)` | список строк на элемент массива. У элемента должен быть дочерний `<template>`: его содержимое копируется на каждую строку и вставляется после него, `fill(row, item, index)` заполняет копию. Нет `<template>` — сбой `у <div> нет дочернего <template>`; первый ребёнок образцом не служит. Проверка при сохранении ловит это заранее: `list` на `ctx.ref('lines')`, у элемента `data-ref="lines"` которого нет `<template>`, — отказ `list-template-missing`. Пример: `<div data-ref="lines"><template><p data-ref="line"></p></template></div>` |
| `focus()` | фокус |

## Цвет и размер из данных

Скрипт не пишет `style`, `class`, `id`, `fill`, `stroke`, `width`, `height` и другие атрибуты вида. `attr` пишет только:

- `aria-*` и свои `data-*` (кроме служебных `data-action`, `data-ref`, `data-behavior`, `data-animate`, `data-section`,
  `data-section-id` и `data-merfy-*` — их ставит шаблон);
- `hidden`, `disabled`, `title`, `alt`, `open`, `tabindex`, `role`, `placeholder`, `min`, `max`, `step`;
- `href` — адрес от корня сайта (`/…`), `#якорь`, `https:`, `mailto:`, `tel:`;
- `src` у `img` и `source` — адрес от корня сайта или `https:`.

Всё остальное — отказ `attr-forbidden`. Проверка при сохранении (`merfy_sections check`, `merfy_extension_dev check`)
находит его в `script.ts`, если имя и значение написаны в коде (`'fill'`, константа, склейка, условие), с файлом, строкой
и названием атрибута: `attr('fill'): этот атрибут код секции не пишет`. Все формы вызова: `x.attr(…)`, `x?.attr(…)`,
`x['attr']('fill', …)`, `x.attr.call(…)`, псевдоним `const put = x.attr` и деструктуризация `const { attr } = x`. Имя, собранное
во время работы (`attr(name, …)` с `name` из данных), при сохранении не видно: его откажет витрина — `ShellError` в
консоли. Пишите имя литералом.

**Цвет, размер и положение, которые приходят из данных** (цвет фона из поля кабинета, ширина полосы в процентах), —
переменная CSS. Скрипт кладёт значение в `--имя` элемента через `cssVar`, шаблон читает его через `var(--имя)`. Классы
Tailwind со своим цветом (`bg-[var(--pick-bg)]`, `bg-(--pick-bg)`) запрещены (`class-arbitrary`), поэтому цвет рисует
SVG-слой: `fill="var(--имя)"` — обычный атрибут шаблона, он принимается.

```astro
<section class="relative isolate overflow-hidden" data-ref="bg">
  <svg class="absolute inset-0 -z-10 size-full" aria-hidden="true">
    <rect width="100%" height="100%" fill="var(--pick-bg)" />
  </svg>
  <h2 class="m-0 text-heading">{settings.heading}</h2>
</section>
```

```ts
mount(el, ctx) {
  // pick.bgColor — цвет из поля кабинета: "#c9a227"
  ctx.watch(ctx.ext.picks.$pick(ctx.settings.pick), (pick) => ctx.ref('bg')?.cssVar('pick-bg', pick?.bgColor ?? null));
}
```

Значение — цвет (`#c9a227`, `rgb(…)`), число или длина. `url(…)`, кавычки и «\» в значении отказывает и проверка, и
витрина, а имя переменной пишется без `--`: латиница в нижнем регистре, цифры и дефис. Пока переменная не задана,
`var(--pick-bg)` пуст и слой не рисуется: сделайте так, чтобы секция без цвета выглядела цельно. Если цвет известен
серверу, проще положить его в шаблон прямо: `fill={settings.pick.bgColor}` — [образцы цвета](data.md#образцы-цвета-на-карточке).
Видимость — `show()`, `hide()`, `toggle(on)`, а не `style`.

Модули SDK по `uses` — корзина, избранное, кто вошёл (`customer`), вход и кабинет (`auth`) — [modules.md](modules.md).

## Вызов функции расширения

Секция с `"uses": ["ext:<id>"]` получает `ctx.ext.<id>`. Имена сторов (`$имя`) и методов (`имя`) задаёт манифест
расширения (`storefront.stores`, `storefront.methods`). Стор с `by: "product"` читают как `$имя(productId)`, стор с
`by: "record"` — как `$имя(recordId)`, где `recordId` — значение параметра секции вида `ext-record`
([data.md](data.md#записи-магазина-в-полях-секции)); пустое значение (`null`, `""`) даёт стор с `null` без запроса, id не
по форме (буквы, цифры, «-» и «_», до 200 знаков) — сбой `mount`. Метод вызывает функцию расширения на сервере:

```ts
ctx.ext.<id>.<метод>(input?: { [ключ]: JSON }, options?: { quiet?: boolean }): Promise<Result>
```

Вызов не бросает и не возвращает выход функции как есть: ответ всегда `Result`.

- Успех — `{ ok: true, data }`. `data` — то, что вернула функция расширения (её `output`); если функция ничего не
  вернула или вернула не JSON, `data` — `null`. Ответ приходит после того, как перечитаны сторы расширения, у которых
  есть подписчики, поэтому `ctx.watch` уже видит новое значение.
- Неудача — `{ ok: false, error: { code, message } }`. `code` — одно из значений таблицы ниже; `message` — строка,
  показывать её покупателю не нужно: уведомление платформа выводит сама.
- `input` — объект JSON или ничего. Другое значение — `invalid`, запрос не уходит.

| `error.code` | Когда приходит | Уведомление покупателю |
|---|---|---|
| `'refused'` | функция расширения отказала через `refuse(код, текст)`; `error.message` — этот `текст`, код `refuse` в ответ секции не попадает | да, с текстом расширения |
| `'unauthorized'` | у метода `customer: true`, а покупатель не вошёл (запрос не уходит), либо шлюз ответил 401 | «Войдите, чтобы продолжить» |
| `'invalid'` | `input` не объект, либо шлюз не нашёл функцию или отказал (`not_found`, `forbidden`, `invalid_input`) | нет; в консоль уходит строка `ctx.ext.<id>.<метод>` (даже при `quiet`) |
| `'server'` | сбой функции или контейнера расширения, ответ не прошёл проверку ядра, любой другой статус | «Не получилось. Попробуйте ещё раз через минуту» |
| `'network'` | ответа нет: обрыв связи или 10 секунд без ответа | «Нет связи с магазином. Проверьте интернет и попробуйте ещё раз» |
| `'limit'` | шлюз ответил 429 | «Слишком много запросов. Попробуйте через минуту» |

Уведомление платформа выводит событием `merfy:notice:show` (его показывает секция «Уведомления», [events.md](events.md)).
Вторым аргументом `{ quiet: true }` уведомление отключается — секция показывает ошибку сама, например рядом с формой.
Для `refused` текст расширения — в `result.error.message`.

```ts
actions: {
  async vote(button, ctx) {
    const result = await ctx.ext.reviews.vote({ reviewId: button.attr('data-review-id') }, { quiet: true });
    if (result.ok) return ctx.ref('count')?.text(String(result.data));
    // refused: сообщение написал сам разработчик расширения, его можно показать как есть
    ctx.ref('error')?.text(result.error.code === 'refused' ? result.error.message : 'Не получилось');
  },
}
```

Для действий SDK (`cart.add` и других) ответ устроен так же: [actions.md](actions.md).

## Поведения из скрипта секции

Готовое [поведение](behaviors.md) запускается разметкой — `data-behavior="accordion"`, `"carousel"`, `"tabs"`, `"dialog"`,
`"video"` — и отвечает на нажатия посетителя. Скрипт секции может командовать им сам: по ссылке с параметром, по
таймеру, по событию страницы. `ctx.behavior(name, el?)` отдаёт команды поведения из разметки **этой** секции; что у
поведения есть как действие, то и команда.

```ts
ctx.behavior('accordion').open(item)    // раскрыть пункт: номер с 0 или id его <details>
ctx.behavior('carousel').goTo(2)        // слайд по номеру; ещё next(), prev(), play(), pause()
ctx.behavior('tabs').select('delivery') // вкладка по data-value
ctx.behavior('dialog').open()           // окно поверх экрана; ещё close(), toggle()
ctx.behavior('video').play()            // воспроизведение; ещё pause()
```

- Поведение ищется среди `data-behavior` секции. Одно на секцию — `ctx.behavior('accordion')`; несколько одного имени —
  второй аргумент, любой элемент внутри нужного: `ctx.behavior('accordion', ctx.ref('faq'))`. Чужой секции поведения
  нет: вложенная секция и соседние секции страницы недоступны, элемент из другой секции — ошибка.
- Команда отвечает как действие SDK — `Result`, не бросает: `{ ok: true, data: {} }` или `{ ok: false, error: { code,
  message } }`. Ошибки вызова — исключения, как у остальных помощников `ctx`: в разметке секции нет такого
  `data-behavior`, у поведения нет команд (команды есть у `accordion`, `carousel`, `tabs`, `dialog`, `video`), секция уже
  снята со страницы.
- Работает на витрине и в превью конструктора одинаково. «Уменьшить движение» команды учитывают так же, как нажатия.
- Нажатие посетителя и команда — один путь: пункт, раскрытый командой, посетитель закрывает щелчком по заголовку.
  Состояние поведения при замене секции в превью сохраняется.

| Поведение | Команда | Что делает | Аргумент |
|---|---|---|---|
| `accordion` | `open`, `close`, `toggle` | раскрыть, свернуть, переключить пункт; у пунктов с общим `name` соседние сворачиваются | номер с 0 или `id` элемента `<details>` |
| `carousel` | `next`, `prev` | следующий и предыдущий слайд; автопрокрутка начинается заново | — |
| `carousel` | `goTo` | слайд по номеру | номер с 0 |
| `carousel` | `play`, `pause` | продолжить и остановить автопрокрутку (`data-autoplay` больше 0); как кнопка `play` | — |
| `tabs` | `select` | открыть вкладку | `data-value` вкладки |
| `video` | `play`, `pause` | запустить и поставить на паузу; браузер без нажатия посетителя может отказать | — |
| `dialog` | `open` | открыть окно | `{ position, side, backdrop }` или ничего |
| `dialog` | `close`, `toggle` | закрыть; открыть закрытое и закрыть открытое | — |

| `error.code` | Когда | Как исправить |
|---|---|---|
| `'refused'` | нет такого пункта аккордеона, слайда или вкладки; у слайдера нет автопрокрутки; в разметке поведения нет частей для команды | взять номер или значение из разметки |
| `'refused'` | `dialog.open`: на странице уже открыто другое модальное окно | закрыть его или открыть своё позже |
| `'invalid'` | неверный аргумент: не число, отрицательный номер, пустая строка; неверный `position`, `side`, `backdrop`; строка `ctx.behavior(…)` в консоли | взять значение из таблицы выше |

Аккордеон раскрывается по ссылке `…/faq?q=delivery`: пункт с таким `id`.

```ts
export default defineSection({
  mount(el, ctx) {
    const id = ctx.page.query.q;
    if (id !== undefined) ctx.behavior('accordion').open(id);
  },
});
```

Слайдер листается стрелками клавиатуры по всей странице, пока посетитель не пользуется полем ввода.

```ts
export default defineSection({
  mount(el, ctx) {
    ctx.on('document', 'keydown', (event) => {
      if (event.key === 'ArrowRight') ctx.behavior('carousel').next();
      if (event.key === 'ArrowLeft') ctx.behavior('carousel').prev();
    });
  },
});
```

### Окно поверх экрана

Окно показывает поведение `dialog`: `<dialog data-part="content">` внутри секции. Секция стоит в шапке, теме или подвале,
как любая другая (`groups` в `section.json`), а окно открывается поверх экрана, где бы она ни стояла.

```astro
<div data-behavior="dialog" data-position="corner">
  <dialog data-part="content" class="w-full max-w-sm bg-background text-foreground p-4">
    <h2>{settings.title}</h2>
    <button data-part="close">Закрыть</button>
  </dialog>
</div>
```

Место задаёт `data-position` на элементе с `data-behavior="dialog"` или аргумент команды — на один раз:
`ctx.behavior('dialog').open({ position: 'sheet' })`.

| Место | Где окно | Как ведёт себя |
|---|---|---|
| `position: 'center'` | по центру экрана | модальное: страница под ним не нажимается и не прокручивается, фокус — на первом поле окна, Tab ходит по кругу внутри окна; затемнение страницы |
| `position: 'sheet'` | шторкой снизу во всю ширину | модальное, как `center` |
| `position: 'corner'` | в углу внизу: `side` — `right` (по умолчанию) или `left` | немодальное: фокус остаётся, где был, страница работает и прокручивается; на телефоне (уже 48rem) — шторкой снизу |

- Без `position` окно ведёт себя, как раньше: место задают классы окна, `data-modal`, `data-anchor` ([behaviors.md](behaviors.md)).
- С `position` модальность, переход и запрет прокрутки зависят от места; `data-transition`, `data-modal` и `data-anchor`
  не читаются. `data-backdrop="false"` или `{ backdrop: false }` — без затемнения под модальным окном; клик мимо окна
  по-прежнему закрывает его. `backdrop: true` у `corner` — `invalid`: у окна в углу фона нет.
- Закрывают окно: кнопка с `data-part="close"`, Esc, клик мимо модального окна, ссылка внутри, `close()`. Фокус
  возвращается туда, где был. «Уменьшить движение» — окно появляется и пропадает сразу.
- Модальное окно на странице одно: пока открыто одно, `open()` другого отвечает `refused`. Угловое окно может стоять
  рядом с модальным.
- Умолчания места лежат в слое `base` стилей: классы окна главнее. Ширину и вид окна задают его классы.
- Выбор секции в конструкторе окно не открывает: в превью оно открывается теми же командами скрипта.

Окно по уходу посетителя: нужен модуль `page` (`"uses": ["page"]`), `$leaving` — [страница целиком](#страница-целиком).

```ts
export default defineSection({
  mount(el, ctx) {
    if (ctx.storage.get('seen') === true) return;
    ctx.watch(ctx.page.$leaving, (leaving) => {
      if (!leaving || ctx.behavior('dialog').open().ok === false) return;
      ctx.storage.set('seen', true);
    });
  },
});
```

## Окно поверх страницы

**Устарело с 03.11.** В конструкторе три блока — шапка, тема и подвал; отдельного блока «Поверх страницы» нет, и
новая секция группу `overlay` не объявляет — отказ [`overlay-retired`](errors.md#overlay-retired). Окно над экраном
секция любого блока показывает поведением `dialog` — [выше](#окно-поверх-экрана). Ниже — как работают секции, принятые
с группой `overlay` раньше: они остаются на витрине и в ревизиях, мерчант видит их в конце блока «Подвал» и может
удалить; `ctx.overlay` у них работает, как работал.

Секция без роли с `"groups": ["overlay"]` в `section.json` — окно: стоит поверх каждой страницы магазина и закрыта, пока
скрипт секции не откроет её. Когда открыть — решает скрипт: сразу, через `ctx.after`, по прокрутке, по событию.
`overlay` вместе с `header`, `page` или `footer` — отказ [`overlay-place`](errors.md#overlay-place).

```ts
ctx.overlay.open(options?: { position?: 'center' | 'corner' | 'sheet'; side?: 'left' | 'right'; backdrop?: boolean }): Result
ctx.overlay.close(): Result
ctx.overlay.$open // стор: true — окно открыто; подписка — ctx.watch
```

| `position` | Где окно | Как ведёт себя |
|---|---|---|
| `'center'` (по умолчанию) | по центру экрана | модальное: страница под ним не нажимается и не прокручивается, фокус — на первом поле окна, Tab ходит по кругу внутри окна |
| `'sheet'` | шторкой снизу во всю ширину | модальное, как `center` |
| `'corner'` | в углу внизу: `side` — `'right'` (по умолчанию) или `'left'` | немодальное: фокус остаётся, где был, страница работает; на телефоне (уже 48rem) — шторкой снизу |

- `backdrop` — затемнение страницы под модальным окном, по умолчанию `true`; `false` — без затемнения, но клик мимо
  окна по-прежнему закрывает его. У `corner` фона нет.
- Закрывают окно: кнопка с `data-action="overlay.close"` (крестик, «Нет, спасибо»), Esc (угловое — если фокус в нём),
  клик мимо модального окна, `ctx.overlay.close()`. Фокус возвращается туда, где был до открытия. После закрытия —
  событие `merfy:overlay:close` с `{ section, id, reason }`, `reason` — `button`, `escape`, `backdrop` или `code`
  ([events.md](events.md)).
- Окно — корень шаблона: ширину задают его классы. `w-full max-w-md` — 28rem по центру, не шире экрана без полей 16px;
  без классов ширины — по содержимому; у шторки корень во всю ширину. Общие настройки секции (`wrapper`) — тоже окну:
  «Цветовая схема» — фон и цвет текста корня (свои `bg-*` и `text-*` корня главнее), «Отступы» — его верхний и нижний
  отступ вместо `py-*`, `pt-*`, `pb-*` шаблона; без правки — отступ секций темы. Не нужны «Отступы» — `"wrapper":
  ["scheme"]` в `section.json`. Вокруг окна ничего не закрашено и клики проходят. Первый заголовок секции — подпись окна
  для читалок экрана (`role="dialog"`, у модального — `aria-modal`).
- «Уменьшить движение» в системе — окно появляется без анимации.
- В превью конструктора окно открывается, когда мерчант выбирает секцию в левой колонке, — с параметрами последнего
  `open()` скрипта, без них — по центру. Фокус у полей конструктора.

| `error.code` | Когда | Как исправить |
|---|---|---|
| `'refused'` | уже открыто окно того же вида: модальное (`center`, `sheet`) — одно на страницу, угловое — одно; второе не встаёт в очередь | закрыть своё окно позже или открыть его по событию `merfy:overlay:close` чужого окна |
| `'refused'` | браузер не умеет окна поверх страницы (нет `popover`, Safari до 17) | ничего: окно не покажется, страница работает как без него |
| `'invalid'` | неверный `position`, `side` или `backdrop`, `backdrop: true` у `corner`; строка `ctx.overlay: …` в консоли | взять значение из таблицы выше |
| `'invalid'` | `data-action="overlay.close"` в секции не поверх страницы | убрать кнопку или поставить секцию в группу `overlay` |

Уведомления покупателю отказы окна не выводят.

```ts
export default defineSection({
  mount(el, ctx) {
    if (ctx.storage.get('seen') === true) return;
    ctx.after(5000, () => ctx.overlay?.open({ position: 'center' }));
    ctx.listen('merfy:overlay:close', (detail) => {
      if (detail.id === ctx.id) ctx.storage.set('seen', true);
    });
  },
});
```

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

Скопировать текст (код, ссылку) — `ctx.share.copy({ text })` или кнопка `data-action="share.copy" data-text="<текст>"`.
Текст пишется в буфер обмена; если буфера нет или браузер отказал, срабатывает запасной способ (скрытое поле и команда
копирования — из нажатия кнопки). Успех — уведомление «Скопировано» (`merfy:notice:show`, секция «Уведомления»);
`{ quiet: true }` убирает уведомление. Пустой `text` — ошибка `invalid` для автора, ответ `{}`.

## Страница целиком

Скрипту секции `window` и `document` недоступны, а `ctx.on('window', 'scroll')` отдаёт событие без положения прокрутки.
Положение прокрутки, уход посетителя и время сервера даёт модуль `page`: с `"uses": ["page"]` в `section.json`
`ctx.page` — это `path`, `query` (как и без модуля) и три стора; читаются через `ctx.watch`.

| Стор | Значение |
|---|---|
| `ctx.page.$scroll` | доля прокрутки страницы, целое от 0 до 100; обновляется не чаще кадра; страница короче окна — 0 |
| `ctx.page.$leaving` | `true` — посетитель собирается уйти: курсор вышел за верхний край окна (к вкладкам и адресной строке) или, на устройстве без курсора, резкая прокрутка вверх к верху страницы. С `true` вместе уходит событие `merfy:page:leaving`. Снова `false`, когда курсор вернулся в окно или посетитель коснулся экрана |
| `ctx.page.$now` | время по серверу магазина в миллисекундах; `null`, пока ответ сервера не пришёл (часам устройства верить нельзя); в превью и если сервер не ответил — часы устройства. Обновляется раз в секунду, пока на стор кто-то подписан |

```ts
mount(el, ctx) {
  const endsAt = Date.parse('2026-12-31T23:59:59+03:00');
  ctx.watch(ctx.page.$scroll, (percent) => ctx.ref('bar')?.cssVar('progress', percent));
  ctx.listen('merfy:page:leaving', () => ctx.ref('offer')?.show());
  ctx.watch(ctx.page.$now, (now) => {
    if (now !== null && now >= endsAt) ctx.ref('offer')?.hide();
  });
}
```

Что показать при уходе, когда и сколько раз, решает секция: модуль только сообщает. Событие приходит один раз на уход,
повторно — после того, как курсор вернулся, а потом ушёл снова. Готовый таймер до даты по времени сервера — поведение
`countdown`, стираемый слой — `scratch` ([behaviors.md](behaviors.md)).

## Оформление заказа

Модуль `checkout` (`"uses": ["checkout"]`) — всё оформление заказа: секция рисует его сторы и зовёт действия, запросы
к магазину, доставке, подсказкам адреса и оплате делает модуль. Базовые секции — «Оформление заказа» (роль
`checkout`, страница `/checkout`) и «Спасибо за заказ» (роль `checkout-result`, `/checkout-result`).

| Стор | Значение |
|---|---|
| `$form` | `{ values, errors }`: поля `email`, `phone`, `country`, `firstName`, `lastName`, `city`, `address`, `postalCode`; ошибка поля видна после ухода с него, все — после «Оплатить» |
| `$settings` | что просит магазин: `phone`, `name` (`name`, `surname`, `name-surname`), `address` (физическая доставка), `signIn` (оформление только после входа), `offer` (оплата предложения по ссылке) |
| `$hints` | подсказки адреса для поля `city` или `address`: `{ field, items: [{ id, text }] }` |
| `$lines` | строки заказа: корзина или предложение по ссылке |
| `$delivery` | `status`, `options` (`id`, `kind`, `title`, `about`, `price`, `cheapest`, `needsPoint`), `selected`, `message`, `points` — пункты выдачи выбранного способа |
| `$payment` | способы оплаты магазина: `methods` (`bank_card`, `sbp`, `sberbank`, `tinkoff_bank` — только включённые), `selected`, `unavailable` — магазин оплату не принимает |
| `$promo`, `$totals` | промокод (`code`, `busy`, `error`) и итоги с доставкой |
| `$status` | `complete` — можно оплатить, `submitting`, `error` — текст под кнопкой, `signIn` — нужен вход |
| `$order` | заказ для «Спасибо за заказ» по `?orderId=` или последний оформленный: номер, имя, контакты, доставка, адрес, оплата, строки, итоги |

Поле пишет `checkout.set({ field, value })` (телефон модуль приводит к виду `+7 (…)`), уход с поля —
`checkout.leave({ field })`, промокод — `checkout.applyPromo({ code })`: их зовёт скрипт. Выборы — действия в разметке:
`checkout.pickHint` (`data-hint-id`, лучше на `pointerdown`, чтобы поле не потеряло фокус раньше), `checkout.selectDelivery`
(`data-option-id`), `checkout.selectPoint` (`data-point-code`), `checkout.selectPayment` (`data-method`),
`checkout.removePromo`, `checkout.submit`.

Номер карты на витрине не вводится. `checkout.submit` проверяет поля, сохраняет покупателя и адрес, создаёт заказ и
платёж выбранным способом и ведёт на страницу платёжки; вернувшись, покупатель попадает на `/checkout-result`. Пока
заказ оформляется, второе нажатие ничего не делает, а повтор после ошибки не создаёт второй заказ. Успех — событие
`merfy:checkout:order`. В превью заказ не оформляется, а `$order` — пример.

```ts
mount(_el, ctx) {
  ctx.watch(ctx.checkout.$payment, (payment) =>
    ctx.ref('methods')?.list(payment.methods, (row, method) => {
      row.attr('data-method', method.key);
      row.attr('aria-checked', method.key === payment.selected ? 'true' : 'false');
      row.ref('title')?.text(method.title);
    }),
  );
},
actions: {
  field(target, ctx) {
    ctx.checkout.set({ field: target.attr('name') ?? '', value: target.value() });
  },
  async pay(_target, ctx) {
    await ctx.checkout.submit();
  },
},
```
