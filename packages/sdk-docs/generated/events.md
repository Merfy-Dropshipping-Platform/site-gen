# События

> SDK 1 · документация 1.12.0 · 2026-10-29

События витрины отправляет ядро SDK; секция слушает их через `ctx.listen`, свой код мерчанта — на `document`.

| Событие | Что случилось | Поля события |
|---|---|---|
| `merfy:page:ready` | все секции страницы запущены | — |
| `merfy:page:view` | просмотр страницы | path — строка |
| `merfy:page:hidden` | вкладку скрыли | — |
| `merfy:page:visible` | вкладку вернули | — |
| `merfy:page:restore` | «Назад»: браузер достал страницу из кеша | — |
| `merfy:page:leave` | уход со страницы | — |
| `merfy:cart:add` | товар добавлен в корзину — после ответа сервера; quantity — сколько добавилось, price — за штуку | lineId — строка; productId — строка; variantId — строка или null; quantity — целое от 0; price — { amount, currency } |
| `merfy:cart:remove` | строка убрана из корзины | lineId — строка; productId — строка; variantId — строка или null; quantity — целое от 0 |
| `merfy:cart:change` | покупатель поменял количество в корзине | lineId — строка; productId — строка; variantId — строка или null; quantity — целое от 0; previousQuantity — целое от 0 |
| `merfy:cart:open` | покупатель открыл выезжающую корзину (cart.open при «Сайдбар») | — |
| `merfy:variant:change` | выбран вариант товара | productId — строка; variantId — строка |
| `merfy:favorites:add` | товар отмечен в избранном | productId — строка |
| `merfy:favorites:remove` | отметка избранного снята | productId — строка |
| `merfy:auth:signin` | покупатель вошёл | — |
| `merfy:auth:signout` | покупатель вышел | — |
| `merfy:search:submit` | отправлен поиск | query — строка |
| `merfy:search:open` | покупатель открыл панель поиска (search.open) | — |
| `merfy:catalog:page` | каталог показал следующую страницу | page — целое от 0 |
| `merfy:section:mount` | секция запущена | section — строка |
| `merfy:section:error` | сбой секции | section — строка; id — строка; script — строка; stage — одно из: mount, runtime, unmount; message — строка |
| `merfy:block:select` | превью: мерчант выбрал блок секции в панели слева | blockId — строка |
| `merfy:block:deselect` | превью: выбор блока секции снят | blockId — строка |
| `merfy:notice:show` | показать уведомление покупателю — его выводит секция «Уведомления» | level — одно из: error, warning; message — строка; code — одно из: out-of-stock, limit, unauthorized, network, server, invalid, refused, может не быть |
| `merfy:consent:change` | выбор в баннере cookie | state — одно из: accepted, declined |

## Коды ошибок

В данных событий `merfy:notice:show` и `merfy:section:error` поле code — одно из: out-of-stock, limit, unauthorized, network, server, invalid, refused.

## Свой код мерчанта

Свой код на странице магазина (раздел «Свой код» в настройках) слушает те же события на `document`:

```js
document.addEventListener('merfy:cart:add', (event) => {
  const { productId, quantity } = event.detail;
  console.log('в корзине', productId, quantity);
});
```

В секции — `ctx.listen('merfy:cart:add', fn)`: подписка снимается вместе с секцией.

