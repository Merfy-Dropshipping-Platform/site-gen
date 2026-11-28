Данные магазина секция читает только объявленные в `section.json` ключом `uses`.

| `uses`    | Что в `Astro.props` | Что в нём                                            |
| --------- | ------------------- | ---------------------------------------------------- |
| `"theme"` | `theme`             | значения [сквозных настроек темы](theme-settings.md) |
| `"shop"`  | `shop`              | публичные данные магазина: название, контакты, адрес |

```astro
---
const { settings, shop } = Astro.props;
---
<p class="m-0">{shop.name}</p>
```

Что в `shop` (всё публичное — то, что магазин и так показывает покупателю):

| Поле               | Что в нём                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| `name`             | название магазина                                                                                            |
| `contacts`         | `phone`, `email` и `fields` — остальные строки «Информации о компании» (`label`, `value`); пустое — `''`, `[]` |
| `policies`         | политики с текстом: `type`, `title`, `url` (`/legal/…`); без текста политики в списке нет                    |
| `payments.online`  | `true`, если магазин принимает оплату онлайн (подключена и выбрана платёжка)                                 |
| `signature`        | своя подпись мерчанта под подвалом; пусто — не вписана, тогда выводят «Разработано на Merfy» ссылкой на `https://merfy.ru/` |
| `catalogUrl`       | адрес каталога или `null`                                                                                    |

Данные магазина меняют кабинет и платёжные настройки, поэтому секция не хранит их в `settings`: правка в кабинете
доходит до превью и витрины сама. `signature` выводят текстом (`{shop.signature}`), не `set:html`.

Корзина, избранное, кто вошёл (`customer`) и вход по коду с кабинетом (`auth`) — модули SDK в браузере, тот же ключ
`uses` ([modules.md](modules.md)). Шапке, которой нужно только «вошла или нет», — `customer`: `auth` добавляет в бандл
страницы код входа.

## Записи магазина в полях секции

Поля видов `product`, `collection`, `blog` и `policy` в `settings` — выбор записи магазина: в ревизии хранится id или
адрес записи (у политики — тип), в шаблоне секция получает публичные поля записи или `null`. Вид `hint` — подсказка в
панели конструктора без значения (например, «Цена меняется на странице "Товары"»).

```astro
---
const { settings } = Astro.props;
---
{settings.product === null ? (
  <p>Товар недоступен</p>
) : (
  <h2>{settings.product.title}</h2>
)}
```

Вид `ext-record` — выбор записи расширения: `{ "kind": "ext-record", "ext": "<id>", "record": "<вид>" }`, вид записи
объявлен в `records` манифеста расширения, список записей в панели отдаёт функция расширения от имени мерчанта. Секция
расширения указывает только свои записи (`ext` = её расширение), секция магазина — записи любого включённого. В ревизии
хранится id записи (пусто — `""` или `null`), в шаблоне `settings.<id>` — этот id строкой; данные записи секция берёт
стором расширения `by: "record"`: `ctx.watch(ctx.ext['<id>'].$имя(ctx.settings.<id>), …)`. Пустой параметр даёт стор с
`null` без запроса. Вид бывает только у секции: в блоке — `setting-invalid`.

### Данные расширения прямо в HTML: `prerender` и `ext`

Без этого первый экран ждёт цепочку «скрипт → запрос к расширению → ответ», а до ответа содержимое скрыто. Если функция
стора публичная, одинаковая для всех посетителей и ничего не меняет, автор расширения разрешает сборке прочитать её
самой: в манифесте у стора `prerender: true` (вместе с `customer: true` нельзя; действует у `by: "record"`).

```json
"storefront": { "stores": { "pickCard": { "fn": "pickCard", "by": "record", "record": "pick", "prerender": true } } }
```

Секция говорит, какое значение ей нужно, объявлением `ext` в `section.json`: имя → `{ from, store }`. `from` — параметр
этой секции вида `ext-record` (из него берутся расширение и вид записи), `store` — имя стора. Имён до 4, имя — как
`data`: латиница, первая строчная.

```json
"ext": { "card": { "from": "settings.pick", "store": "pickCard" } }
```

В шаблоне значение — `Astro.props.ext.<имя>`: то, что возвращает функция стора для выбранной записи, или `null`. `null` —
запись не выбрана, у стора нет `prerender`, расширение не ответило вовремя, значение больше предела; шаблон должен
уметь рисовать и без значения — тогда секция выглядит, как раньше, а данные принесёт скрипт.

```astro
---
const { settings, ext } = Astro.props;
---
{ext.card !== null && (
  <img src={ext.card.cover} alt="" />
)}
```

Скрипт ничего не меняет в записи: `ctx.watch(ctx.ext.<id>.$имя(ctx.settings.<id>), …)` при запуске получает то же
значение сразу, без запроса, и рисует ту же разметку, что шаблон. Один раз после загрузки страницы стор читается заново
(живое значение: правка записи в кабинете), и `watch` срабатывает снова, только если значение изменилось.

Пределы: значение стора — до 7 КБ JSON (`<` считается за шесть байт), до 4 имён на секцию; вызов расширения — до 3 с, до
10 вызовов за сборку, до 100 записей в вызове. Сбой, срок или превышение предела не ломают сборку: у этой секции нет
значения, она рисуется без `prerender`. Значение в HTML — на момент сборки.

Поля `product` и `collection` бывают и у типа блока — плитка «Товар» или «Коллекция» в элементе галереи. Блок получает
запись так же, в `block.settings.<id>`, правила пустого поля — те же. Подсказка `hint` бывает и у типа блока — подпанель
из одной подсказки, значения у неё нет. Поля `blog`, `policy` и `menu` — только у секции: в блоке — `setting-invalid`.

```astro
{blocks.map((block) => (
  <div>
    {block.settings.product && <a href={block.settings.product.url}>{block.settings.product.title}</a>}
  </div>
))}
```

Пустое поле на шаблоне записи своего вида — запись этой страницы: секция «Карточка товара» на шаблоне «Товар»
показывает товар страницы. На других страницах пустое поле — как у секций пяти тем на проде: первый товар, все товары
(первые 24), записи всех блогов (первые 12); у политики — `null`.

Публичные поля по виду (`null`-запись не ломает шаблон — проверьте поле на `null`):

| Вид          | Публичные поля записи                                                                                                                                                                                                                                                                                             |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `product`    | `id`, `title`, `slug`, `url`, `description`, `price`, `compareAtPrice`, `images`, `available`, `preorder`, `options`, `variants`, `collections`, `updatedAt`                                                                                                                                                                  |
| `collection` | `id`, `title`, `slug`, `url`, `description`, `images`, `productsCount`, `products` (первые 24 — карточки: `id`, `title`, `url`, `price`, `compareAtPrice`, `image`, `images`, `available`, `preorder`, `variantId`, `colors`; `image` — первое фото, `images` — первые два, для `data-photos` поведения `card-photos`: `{product.images.join(' ')}`; `variantId` — сочетание вариантов по умолчанию для `cart.add`, у товара без вариантов `null`; `colors` — образцы цвета `{ title, swatch }`, `swatch` — `#rrggbb`, до 6, без цветов `[]`) |
| `blog`       | `id`, `title`, `handle`, `url`, `articlesCount`, `articles` (первые 12, новые сверху: `id`, `title`, `url`, `publishedAt`, `publishedText`, `cover`, `excerpt`)                                                                                                                                                   |
| `policy`     | `type`, `title`, `url`, `html`                                                                                                                                                                                                                                                                                    |

Дата статьи — в двух видах: `publishedAt` (время ISO, для `datetime`) и `publishedText` (она же словами по Москве,
«20 октября 2026 г.», для показа). У статьи без даты `publishedAt` — `null`, `publishedText` — пустая строка. Форматировать
дату в шаблоне не нужно: `Date` и `Intl` там недоступны.

### Товар под заказ

`available` — товар можно положить в корзину: он в наличии или продаётся под заказ. `preorder` у товара и у карточки —
`true`, когда остатка нет, а заказ разрешён (мерчант включил «Продавать, когда закончился»); у товара в наличии и у
товара, которого нельзя заказать, — `false`. Данных нет (магазин собран до поля) — тоже `false`. Надпись «Под заказ»
вместо «В наличии» — по `preorder`, обе надписи — поля секции:

```astro
{settings.product && settings.product.available && (
  <p class="m-0">{settings.product.preorder ? settings['preorder-text'] : settings['stock-text']}</p>
)}
```

### Образцы цвета на карточке

Цвет товара — данные, а `style` и произвольные классы запрещены ([styles.md](styles.md)). Образец рисуют SVG с заливкой
атрибутом `fill`; форму (круг, квадрат) задаёт рамка с `overflow-hidden` и классом радиуса:

```astro
{card.colors.map((color) => (
  <span class="inline-flex size-5 overflow-hidden rounded-full border border-border" title={color.title}>
    <svg class="size-full" viewBox="0 0 20 20" role="img" aria-label={color.title}><rect width="20" height="20" fill={color.swatch} /></svg>
  </span>
))}
```

### Цена — объект `Money`

`price` и `compareAtPrice` записи, `price` и `compareAtPrice` карточек, `price` и `compareAtPrice` каждого варианта
товара — не число и не строка, а объект `Money`: `{ amount, currency, text }`. `amount` — копейки (целое число),
`currency` — `"RUB"`, `text` — готовая подпись «1 900 ₽». В шаблоне выводите `price.text`. Запись
`{settings.product.price}` напечатает `[object Object]`: проверка при сохранении откажет такой секции кодом
`render-leak` ([errors.md](errors.md#render-leak)). Сравнивайте цены по `amount`: поля `value` у цены нет, и
`price.value` проверка тоже не пропустит — `render-field-unknown` ([errors.md](errors.md#render-field-unknown)).
`compareAtPrice` у товара без скидки — `null`: проверьте его до вывода. Деньги в событиях корзины — другой объект, `{ amount, currency }` без `text` ([events.md](events.md)).

```astro
{settings.product && (
  <p class="m-0">
    {settings.product.price.text}
    {settings.product.compareAtPrice && <s class="ml-2">{settings.product.compareAtPrice.text}</s>}
  </p>
)}
```

Проверка при сохранении рисует секцию ещё и на примерах данных магазина: товар с ценой, старой ценой, вариантами и
картинками, коллекция, блог, статья, политика, контакты магазина, настройки темы, страницы каталога и записей. Если в
HTML этого рендера в тексте или в `alt`, `title`, `aria-label`, `placeholder`, `value`, `href`, `src`, `content` есть
`[object Object]`, `undefined` или `NaN`, секция не сохранится. В `ctx.data` скрипта деньги тоже объект `Money`.

### `data` — записи для `script.ts`

Скрипт секции получает записи только через ключ `data` в `section.json`: имя → `from` и `fields` — публичные поля.
Проверка при сохранении не пропускает непубличные поля (`data-field-private`) и чтения `ctx.data.<имя>` без объявления
(`data-unknown`).

```json
"data": {
  "product": { "from": "settings.product", "fields": ["id", "title", "price", "available"] }
}
```

```ts
export default defineSection({
  mount(_el, ctx) {
    if (ctx.data.product !== null) ctx.log(ctx.data.product.title);
  },
});
```

Записи нет — `null`. Ссылки меню на товары и коллекции хранятся по id, шаблон получает основной адрес записи.

`set:html` с HTML записей: кроме richtext — `page.record.html` (текст статьи, очищенный сборщиком, или текст
политики с экранированием) и `settings.<id>.html` поля вида `policy`. Другие поля записей — только текстом; имя
`page` или `settings`, связанное параметром стрелки, — отказ. Элемент с таким `set:html` получает класс `rich-text`
([styles.md](styles.md#html-текст)). Пример — шаблон «Статьи»:

```astro
---
const { page } = Astro.props;
---
<div class="mx-auto max-w-page px-4 font-body">
  {page.id === 'article' && page.record && (
    <article class="flex flex-col gap-4">
      <h1 class="m-0 font-heading weight-heading text-3xl text-heading">{page.record.title}</h1>
      {page.record.publishedAt && <p class="m-0 text-sm text-foreground">{page.record.publishedText}</p>}
      {page.record.cover && <img class="h-auto w-full rounded-button" src={page.record.cover} alt={page.record.title} />}
      <div class="rich-text text-foreground" set:html={page.record.html}></div>
    </article>
  )}
</div>
```

## Список страницы

`page.list` — список страницы: карточки этой страницы, номера страниц, фильтры и сортировки. `uses` для него не нужен.
Он есть у каталога (`/catalog`, все товары магазина), у страницы коллекции (`/collections/<адрес>`, товары коллекции в
порядке мерчанта), у страницы блога (статьи, новые сверху) и у любой своей страницы, где стоит секция с полем `per-page`
(товары её поля `collection`, пустое — все товары). На страницах товара, статьи и политики и без такой секции —
`null`: проверяйте `page.list &&`.

Размер страницы — поле `per-page` вида `range` от 2 до 24 (имя словаря «Карточки»): его читает сама платформа, первой
сверху секции страницы. Без поля — 24 товара или 12 статей.

| Поле         | Что в нём                                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| `kind`       | `'products'` или `'articles'`                                                                               |
| `items`      | карточки этой страницы: у товаров — поля карточки коллекции, `hasVariants` и [метки](#карточка-списка-метки-скидка-остаток-теги) (`badges`, `discountPercent`, `stockLeft`, `tags`), у статей — карточки блога |
| `total`      | сколько всего с выбранными фильтрами; `totalLabel` — число со словом: «1 товар», «3 товара», «12 товаров»      |
| `page`       | номер этой страницы, с 1; `pages` — сколько страниц; `perPage` — размер страницы                             |
| `url`        | адрес списка без номера и параметров: `/catalog`, `/collections/kashemir`                                   |
| `prev`       | адрес предыдущей страницы или `null`; `next` — следующей или `null`                                         |
| `links`      | номера для навигации: `{ page, url, current }`; `page: null` и `url: null` — многоточие                      |
| `query`      | выбранное покупателем: `sort`, `minPrice`, `maxPrice` (рубли), `availability`, `collections`, `filters`, `q`, `page`, `tags`, `badges`, `minDiscount`, `newDays`, `lowStockMax` |
| `sorts`      | сортировки: `{ value, label, selected }`; у статей — `[]`                                                   |
| `facets`     | значения фильтров: `filters` — [список фильтров одним видом](#динамичные-фильтры-facetsfilters), рисуйте его по `type`; старые `price` (`{ min, max }` — `Money`) или `null`, `groups` (`{ key, name, values: [{ value, selected }] }`), `collections` (`{ slug, title, selected }`, только у `/catalog`) остаются; у статей — `null` |

### Страницы списка

Каждая следующая страница — отдельная страница сайта: `/catalog/page/2`, `/collections/<адрес>/page/2`,
`/blogs/<адрес>/page/2`. Платформа собирает их сама по `per-page` и числу товаров; ссылки на них — в `next`, `prev` и
`links`. Это обычные ссылки `<a href>`: они работают и без скрипта.

### Фильтры и сортировка

Фильтры и сортировка — обычная форма `GET` на `page.list.url`. Имена полей формы:

| Имя                    | Значение                                                              |
| ---------------------- | --------------------------------------------------------------------- |
| `sort`                 | `popular`, `newest`, `price_desc`, `price_asc` — из `page.list.sorts` |
| `availability`         | `in_stock`, `sold_out`; пусто — все                                   |
| `min_price`, `max_price` | рубли                                                                 |
| `filter.<key>`         | значение группы вариантов (флажок на каждое) — `<key>` из `facets.filters[].param`, не из `facets.groups[].key` |
| `collection`           | адрес коллекции — только у `/catalog`, из `facets.collections` или `facets.filters`    |
| `tag`                  | тег товара; повторяется, теги — «или» (хоть один из выбранных)         |
| `badge`                | признак товара: `sale`, `new`, `low_stock`, `preorder`, `in_stock`; повторяется, признаки — «и» (все выбранные); чужие значения отбрасываются |
| `min_discount`         | скидка товара не меньше N процентов, целое 1–99                        |
| `new_days`             | сколько дней товар считается новинкой (признак `new`), 1–365; без параметра — 30 |
| `low_stock_max`        | при каком остатке (штук) товар считается «мало осталось» (`low_stock`), 1–1000; без параметра — 5 |
| `q`                    | поиск — передайте скрытым полем, если он есть в `query.q`              |

Значение вне пределов (`min_discount=150`) платформа считает невыбранным. Страницу с параметрами
(`/collections/kashemir?sort=price_asc&filter.цвет=Синий&badge=sale`) платформа рисует по запросу: секция получает тот
же `page.list`, только с выбранным. Отмечать выбранное — по `selected` и `query`. Страница с параметрами списка не
индексируется (`noindex, follow`).

### Динамичные фильтры: `facets.filters`

Секция рисует фильтры **по `type`** и не знает конкретных групп («страна», «цвет», «теги»): платформа отдаёт список,
секция проходит по нему и рисует каждый фильтр. Какая группа за ним стоит, секция не проверяет — новый фильтр
появляется в панели сам, без правки секции.

| `type`   | Поля                                                                  | Как рисовать                                                          |
| -------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `range`  | `key`, `kind`, `label`, `params: { min, max }`, `min`, `max`, `clearUrl` | два поля «от» и «до»; `name` — из `params.min` и `params.max`, подсказка — `min` и `max` (рубли) |
| `flags`  | `key`, `kind`, `label`, `param`, `options`, `clearUrl`                | чипы или флажки: по одному на значение                                |
| `list`   | те же, что у `flags`                                                  | список значений с подписью и числом `count`                           |

Значение (`options[]`) — `{ value, label, count, selected, url }`: `label` — подпись для экрана, `count` — сколько
товаров будет, если выбрать это значение, `selected` — выбрано сейчас, `url` — адрес первой страницы списка, где это
значение выбрано (если выбрано — где снято): обычная ссылка `<a href>`, работает без скрипта и без формы. `clearUrl` —
адрес списка без значений этого фильтра, `null`, если у фильтра ничего не выбрано. `param` — имя параметра адреса
(`badge`, `collection`, `tag`, `filter.<ключ группы>`), `value` — его значение: для формы `name={param}` и
`value={option.value}`. `kind` говорит, откуда фильтр (`price`, `badge`, `collection`, `tag`, `variant`): рисуйте по
`type`, а не ветвитесь по `kind`.

Незнакомые `type` пропускайте, а не падайте. Незнакомый `kind` и лишние поля фильтра или значения платформа
пропускает как есть: фильтр с понятной формой (`list` со значениями, `range` с `min` и `max`) приходит в `filters`
без правки платформы и без правки секции.

Что в `filters` бывает: цена (`kind: 'price'`, `type: 'range'`), группы вариантов (`kind: 'variant'`), признаки
(`kind: 'badge'`, `flags`), теги (`kind: 'tag'`) и коллекции (`kind: 'collection'`, только у `/catalog`). Страница с
параметрами получает значения от сервиса товаров. Без ответа сервиса — статичные страницы каталога, коллекции и
превью — в `filters` только цена и группы вариантов по товарам этого списка: признаков, тегов и коллекций нет. Секция
не должна зависеть от того, что они есть.

**Ключ группы вариантов — из `filters[].param`, а не из `groups[].key`.** У `kind: 'variant'` `key` и `param` — имя
группы в нижнем регистре, пробелы остаются пробелами (`filter.цвет кожи`). В старом `groups[].key` пробелы заменены на
`_`, и группа из нескольких слов по нему не фильтрует. Ссылки и имена полей формы берите из `filters[].param` и
`option.url`. Старые `facets.price`, `groups` и `collections` на месте и работают, но новые секции рисуйте от `filters`.

Фильтры рисуются ссылками `option.url`; бейджи — по `card.badges`:

```astro
---
const { page } = Astro.props;
const BADGE_TEXT = { sale: 'Скидка', new: 'Новинка', low_stock: 'Мало осталось', preorder: 'Предзаказ' };
const list = page.list;
---
{list && list.facets && (
  <form data-part="filters" method="get" action={list.url}>
    {list.facets.filters.map((filter) => (
      <fieldset>
        <legend>{filter.label}</legend>
        {filter.type === 'range' && (
          <>
            <input type="number" name={filter.params.min} placeholder={String(filter.min)} />
            <input type="number" name={filter.params.max} placeholder={String(filter.max)} />
          </>
        )}
        {(filter.type === 'list' || filter.type === 'flags') && filter.options.map((option) => (
          <a href={option.url} aria-pressed={String(option.selected)}>{option.label} ({option.count})</a>
        ))}
        {filter.clearUrl && <a href={filter.clearUrl}>Сбросить</a>}
      </fieldset>
    ))}
    <button type="submit">Применить</button>
  </form>
)}
{list && (
  <ul data-part="list" data-page={list.page}>
    {list.items.map((card) => (
      <li>
        <a href={card.url}>{card.title}</a> {card.price.text}
        {card.badges.map((badge) => BADGE_TEXT[badge] && <span>{BADGE_TEXT[badge]}</span>)}
        {card.discountPercent && <span>−{card.discountPercent}%</span>}
        {card.stockLeft !== null && card.badges.includes('low_stock') && <span>Осталось {card.stockLeft}</span>}
      </li>
    ))}
  </ul>
)}
```

Поля `range` уходят формой `GET` на `page.list.url` ([Фильтры и сортировка](#фильтры-и-сортировка)), значения
`list` и `flags` — ссылками: кнопка «Применить» нужна только диапазону.

### Карточка списка: метки, скидка, остаток, теги

К полям карточки товара в `page.list.items` добавлены:

| Поле              | Что в нём                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| `badges`          | признаки, которые у товара сейчас верны: `sale`, `new`, `low_stock`, `preorder`, `in_stock`; незнакомые строки приходят как есть |
| `discountPercent` | самая большая скидка товара, целые проценты; скидки нет — `null`                                  |
| `stockLeft`       | суммарный остаток, штук; данных нет — `null`                                                      |
| `tags`            | теги товара, `[]`, если их нет                                                                    |

Список собран только из записей сборки (статичные страницы, превью) — `badges` и `tags` пустые, `discountPercent` и
`stockLeft` — `null`: рисуйте метку, только если значение есть.

Следующие части (свои группы мерчанта, кружки цвета, распределение цен) расширят `filters`; секция, которая рисует
список по `type`, подхватит их без правки.

### Поведение `catalog`

На корне секции списка — `data-behavior="catalog"` и `data-paging={settings.paging}` (поле «Как листать»: `pages` —
номера, `more` — «Показать ещё», `scroll` — бесконечная прокрутка). Поведение дописывает строки следующей страницы без
перехода, применяет фильтры при выборе и меняет адрес. Части: строки — `data-part="list"` (с `data-page={page.list.page}`),
`data-part="next"` и `data-part="prev"` — ссылки на `page.list.next` и `prev`, `data-part="pages"` — номера,
`data-part="filters"` — форма, `data-part="empty"` — пусто, `data-part="status"` — объявление для экранного диктора
([behaviors.md](behaviors.md)). Фильтры и сортировка «Каталога» и «Коллекции» — блоки `filters` и `sort`: мерчант
убирает и добавляет их в конструкторе.

```astro
---
const { settings, page } = Astro.props;
---
<div class="mx-auto max-w-page px-4" data-behavior="catalog" data-paging={settings.paging}>
  {page.list && (
    <form data-part="filters" method="get" action={page.list.url}>
      {page.list.sorts.map((sort) => (
        <label><input type="radio" name="sort" value={sort.value} checked={sort.selected} /> {sort.label}</label>
      ))}
      {page.list.facets && page.list.facets.filters.map((filter) => (filter.type === 'list' || filter.type === 'flags') && filter.options.map((option) => (
        <label><input type="checkbox" name={filter.param} value={option.value} checked={option.selected} /> {option.label}</label>
      )))}
    </form>
  )}
  {page.list && (
    <ul class="m-0 grid list-none grid-cols-2 gap-4 p-0" data-part="list" data-page={page.list.page}>
      {page.list.items.map((card) => <li><a href={card.url}>{card.title}</a> {card.price.text}</li>)}
    </ul>
  )}
  {page.list && page.list.next && <a data-part="next" href={page.list.next}>Показать ещё</a>}
</div>
```

### Каталог и коллекция не теряют фильтры и листание

Секция — список товаров страницы каталога или коллекции, если её имя `catalog`, `collection` или оканчивается на
`-catalog`, `-collection`; если у неё есть «Карточки» (`per-page`) и поле вида `collection`; или если она читает
`page.list.facets` или `page.list.sorts`. Такой секции нужны: поле `per-page`, корень `data-behavior="catalog"`, строки
`data-part="list"` из `page.list.items`, переход дальше по `page.list.next` или `page.list.links`, форма
`data-part="filters"` с `page.list.facets` и сортировка из `page.list.sorts`; шаблон, который показывает их по типу
блока, — блоки `filters` и `sort` в `section.json`. Чего-то нет — проверка отказывает кодом
[`list-incomplete`](errors.md#list-incomplete) и называет, чего не хватает. Образец — библиотечные `catalog` и
`collection`. Витрине товаров на главной листание не нужно: назовите её иначе (`featured-products`) и берите товары из
поля `collection` — `settings.collection.products`.
