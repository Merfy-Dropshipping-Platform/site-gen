# Стыки с витриной

> SDK 1 · документация 1.47.0 · 2026-11-28

Что секция может взять у витрины и что обязана ей отдать. Вёрстка свободная, стыки — нет. Читай вместе со
[шпаргалкой](quick.md); полностью — [data.md](data.md), [actions.md](actions.md), [styles.md](styles.md).

## Данные

Поля `product`, `collection`, `blog`, `policy` дают запись или `null` ([data.md](data.md#записи-магазина-в-полях-секции)).
Других полей нет.

| Запись | Где | Поля |
|---|---|---|
| товар | поле `product` | `id`, `title`, `slug`, `url`, `description`, `price`, `compareAtPrice`, `images`, `available`, `preorder`, `options`, `variants`, `collections`, `updatedAt` |
| вариант | `product.variants[i]` | `id`, `title`, `price`, `compareAtPrice`, `available`, `options` |
| группа вариантов | `product.options[i]` | `id`, `name`, `values` |
| значение группы | `product.options[i].values[j]` | `id`, `value`, `images`, `swatch` |
| цена | `price`, `compareAtPrice` везде | `amount`, `currency`, `text` |
| коллекция | поле `collection` | `id`, `title`, `slug`, `url`, `description`, `images`, `productsCount`, `products` |
| карточка товара | `collection.products[i]` | `id`, `title`, `url`, `price`, `compareAtPrice`, `image`, `available`, `preorder`, `images`, `variantId`, `colors` |
| блог | поле `blog` | `id`, `title`, `handle`, `url`, `articlesCount`, `articles` |
| карточка статьи | `blog.articles[i]` | `id`, `title`, `url`, `publishedAt`, `publishedText`, `cover`, `excerpt` |
| статья | `page.record` на странице статьи | `id`, `title`, `slug`, `url`, `publishedAt`, `publishedText`, `cover`, `excerpt`, `html`, `blog` |
| страница-правило (политика) | поле `policy` | `type`, `title`, `url`, `html` |

- Цена — объект, не число: выводи `price.text` («1 900 ₽»), сравнивай и считай скидку по `price.amount` (копейки).
  `price.value` нет; `{price}` целиком — отказ `render-leak`. `compareAtPrice` у товара без скидки — `null`.
- У карточки в `collection.products` фото — `image` (первое) и `images`; сочетание для корзины — `variantId`. Поля
  `variants` у карточки нет: оно у товара.
- У коллекции есть `images` — её обложка (`collection.images[0]`). Отдельное поле-картинка под обложку не нужно.

## Кнопки

`data-action` и его параметры — атрибуты одной кнопки. Значения берут из записи: `data-product-id={product.id}` (у
карточки `card.id`), `data-variant-id={card.variantId}` или `product.variants[0].id`.

| `data-action` | Обязательно | Можно | Что сделает витрина |
|---|---|---|---|
| `cart.add` | `data-product-id` | `data-variant-id`, `data-quantity` | добавить товар в корзину |
| `cart.change` | `data-line-id`, `data-quantity` | — | поменять количество строки корзины |
| `cart.remove` | `data-line-id` | — | убрать строку из корзины |
| `checkout.pickHint` | `data-hint-id` | — | выбрать подсказку адреса из $hints |
| `checkout.selectDelivery` | `data-option-id` | — | выбрать способ доставки из $delivery.options |
| `checkout.selectPoint` | `data-point-code` | — | выбрать пункт выдачи перевозчика из $delivery.points |
| `checkout.selectPayment` | `data-method` | — | выбрать способ оплаты |
| `favorites.toggle` | `data-product-id` | — | отметить товар в избранном или снять отметку |
| `variants.pick` | `data-product-id`, `data-group`, `data-value` | — | выбрать значение группы вариантов товара |
| `share.copy` | `data-text` | — | скопировать текст в буфер обмена (промокод, ссылку) |

Без параметров: `cart.open`, `cart.checkout`, `checkout.removePromo`, `checkout.submit`, `auth.signout`, `consent.accept`, `consent.decline`, `search.open`, `share.page`, `overlay.close`.

Кнопка без обязательного параметра не сработает.

## Пустые поля

Поле записи не выбрано — `null`. Пустое поле на шаблоне записи своего вида — запись этой страницы: секция «Карточка
товара» на шаблоне «Товар» показывает товар страницы. На других страницах пустое поле — как у секций пяти тем на
проде: первый товар, все товары (первые 24), записи всех блогов (первые 12); у политики — `null`.

Нет данных — блок не рисуется: `{settings.product && (…)}`, `images.length > 0`, `compareAtPrice &&`. В разметке нет
обращений к владельцу магазина («выберите товар в настройках»): так сделаны `collection-products` и `collections`.

## Тема

Заголовок секции и кнопки берут вид из токенов, а не из своих значений: так секции одного магазина выглядят одной
рукой и перекрашиваются «Настройками темы» ([styles.md](styles.md)).

| Что | Классы |
|---|---|
| заголовок секции | `m-0 font-heading weight-heading tracking-heading text-heading text-2xl md:text-3xl` |
| главная кнопка | `inline-flex h-11 items-center justify-center rounded-button border-width-button border-primary-border bg-primary px-6 text-sm text-primary-foreground shadow-button hover:bg-primary-hover hover:text-primary-hover-foreground` |
| цена, со скидкой, старая в `<s>` | `text-price`, `text-sale`, `text-price-old` |
| плашка скидки | `rounded-badge bg-sale px-2 py-1 text-xs text-sale-foreground` |
| фото; ширина секции | `rounded-media`, `mx-auto max-w-page px-4` |

## Пример стыков

Не вёрстка для подражания, а минимум стыков: `price.text`, скидка по `amount`, `cart.add`, `available === false`.

joints-product/

```json
{
  "sdk": 1,
  "name": "joints-product",
  "kind": "section",
  "title": "Товар: стыки с витриной",
  "uses": ["cart"],
  "settings": [
    { "id": "product", "label": "Выбор товара", "setting": { "kind": "product" } },
    { "id": "heading", "label": "Заголовок", "setting": { "kind": "string", "default": "Товар недели" } },
    { "id": "button-label", "label": "Надпись кнопки", "setting": { "kind": "string", "default": "В корзину" } }
  ]
}

```

```astro
---
const { settings } = Astro.props;
---
{settings.product && (
  <div class="mx-auto flex max-w-page flex-col gap-4 px-4 font-body">
    {settings.heading && (
      <h2 class="m-0 font-heading weight-heading tracking-heading text-heading text-2xl md:text-3xl">{settings.heading}</h2>
    )}
    {settings.product.images.length > 0 && (
      <img src={settings.product.images[0]} alt={settings.product.title} class="aspect-square w-full rounded-media object-cover" />
    )}
    <a href={settings.product.url} class="text-xl text-foreground">{settings.product.title}</a>
    <p class="m-0 flex flex-wrap items-baseline gap-x-2">
      <span class="text-lg weight-heading text-price">{settings.product.price.text}</span>
      {settings.product.compareAtPrice && <s class="text-sm text-price-old">{settings.product.compareAtPrice.text}</s>}
      {settings.product.compareAtPrice && settings.product.compareAtPrice.amount > settings.product.price.amount && (
        <span class="rounded-badge bg-sale px-2 py-1 text-xs text-sale-foreground">−{Math.round((1 - settings.product.price.amount / settings.product.compareAtPrice.amount) * 100)} %</span>
      )}
    </p>
    {settings['button-label'] && (
      <button
        type="button"
        class="inline-flex h-11 items-center justify-center rounded-button border-width-button border-primary-border bg-primary px-6 text-sm text-primary-foreground shadow-button hover:bg-primary-hover hover:text-primary-hover-foreground disabled:opacity-40"
        data-action="cart.add"
        data-product-id={settings.product.id}
        data-variant-id={settings.product.variants[0]?.id}
        disabled={settings.product.available === false}
      >{settings['button-label']}</button>
    )}
  </div>
)}

```

