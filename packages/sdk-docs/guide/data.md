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
| `product`    | `id`, `title`, `slug`, `url`, `description`, `price`, `compareAtPrice`, `images`, `available`, `options`, `variants`, `collections`, `updatedAt`                                                                                                                                                                  |
| `collection` | `id`, `title`, `slug`, `url`, `description`, `images`, `productsCount`, `products` (первые 24 — карточки: `id`, `title`, `url`, `price`, `compareAtPrice`, `image`, `images`, `available`, `variantId`, `colors`; `image` — первое фото, `images` — первые два, для `data-photos` поведения `card-photos`: `{product.images.join(' ')}`; `variantId` — сочетание вариантов по умолчанию для `cart.add`, у товара без вариантов `null`; `colors` — образцы цвета `{ title, swatch }`, `swatch` — `#rrggbb`, до 6, без цветов `[]`) |
| `blog`       | `id`, `title`, `handle`, `url`, `articlesCount`, `articles` (первые 12, новые сверху: `id`, `title`, `url`, `publishedAt`, `publishedText`, `cover`, `excerpt`)                                                                                                                                                   |
| `policy`     | `type`, `title`, `url`, `html`                                                                                                                                                                                                                                                                                    |

Дата статьи — в двух видах: `publishedAt` (время ISO, для `datetime`) и `publishedText` (она же словами по Москве,
«20 октября 2026 г.», для показа). У статьи без даты `publishedAt` — `null`, `publishedText` — пустая строка. Форматировать
дату в шаблоне не нужно: `Date` и `Intl` там недоступны.

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
`render-leak` ([errors.md](errors.md#render-leak)). `compareAtPrice` у товара без скидки — `null`: проверьте его до
вывода. Деньги в событиях корзины — другой объект, `{ amount, currency }` без `text` ([events.md](events.md)).

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
