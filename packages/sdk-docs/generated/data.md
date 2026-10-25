# Данные магазина

> SDK 1 · документация 1.0.0 · 2026-10-24

Данные магазина секция читает только объявленные в `section.json` ключом `uses`.

| `uses` | Что в `Astro.props` | Что в нём |
|---|---|---|
| `"theme"` | `theme` | значения [сквозных настроек темы](theme-settings.md) |
| `"shop"` | `shop` | публичные данные магазина: название, контакты, адрес |

```astro
---
const { settings, shop } = Astro.props;
---
<p class="m-0">{shop.name}</p>
```

Корзина, избранное и вход — модули SDK в браузере, тот же ключ `uses` ([modules.md](modules.md)).

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

Пустое поле на шаблоне записи своего вида — запись этой страницы: секция «Карточка товара» на шаблоне «Товар»
показывает товар страницы. На других страницах пустое поле — как у секций пяти тем на проде: первый товар, все товары
(первые 24), записи всех блогов (первые 12); у политики — `null`.

Публичные поля по виду (`null`-запись не ломает шаблон — проверьте поле на `null`):

| Вид | Публичные поля записи |
|---|---|
| `product` | `id`, `title`, `slug`, `url`, `description`, `price`, `compareAtPrice`, `images`, `available`, `options`, `variants`, `collections`, `updatedAt` |
| `collection` | `id`, `title`, `slug`, `url`, `description`, `images`, `productsCount`, `products` (первые 24 — карточки: `id`, `title`, `url`, `price`, `compareAtPrice`, `image`, `available`) |
| `blog` | `id`, `title`, `handle`, `url`, `articlesCount`, `articles` (первые 12, новые сверху: `id`, `title`, `url`, `publishedAt`, `cover`, `excerpt`) |
| `policy` | `type`, `title`, `url`, `html` |

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

