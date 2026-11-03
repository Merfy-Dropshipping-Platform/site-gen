# События

> SDK 1 · документация 1.32.0 · 2026-11-03

События витрины отправляет ядро SDK; секция слушает их через `ctx.listen`, свой код мерчанта — на `document`.

| Событие | Что случилось | Поля события |
|---|---|---|
| `merfy:page:ready` | все секции страницы запущены | — |
| `merfy:page:view` | просмотр страницы | path — строка |
| `merfy:page:hidden` | вкладку скрыли | — |
| `merfy:page:visible` | вкладку вернули | — |
| `merfy:page:restore` | «Назад»: браузер достал страницу из кеша | — |
| `merfy:page:leave` | уход со страницы | — |
| `merfy:page:leaving` | посетитель собирается уйти: курсор вышел за верхний край окна, а без курсора — резкая прокрутка вверх к верху страницы (модуль page; стор `$leaving`) | — |
| `merfy:cart:add` | товар добавлен в корзину — после ответа сервера; quantity — сколько добавилось, price — за штуку | lineId — строка; productId — строка; variantId — строка или null; quantity — целое от 0; price — { amount, currency } |
| `merfy:cart:remove` | строка убрана из корзины | lineId — строка; productId — строка; variantId — строка или null; quantity — целое от 0 |
| `merfy:cart:change` | покупатель поменял количество в корзине | lineId — строка; productId — строка; variantId — строка или null; quantity — целое от 0; previousQuantity — целое от 0 |
| `merfy:cart:open` | покупатель открыл выезжающую корзину (cart.open при «Сайдбар») | — |
| `merfy:checkout:order` | заказ оформлен, покупатель уходит на страницу платёжки; total — к оплате с доставкой, method — выбранный способ оплаты | orderId — строка; total — { amount, currency }; method — одно из: bank_card, sbp, sberbank, tinkoff_bank |
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
| `merfy:notice:show` | показать уведомление покупателю — его выводит секция «Уведомления» | level — одно из: error, warning, info; message — строка; code — одно из: out-of-stock, limit, unauthorized, network, server, invalid, refused, может не быть |
| `merfy:consent:change` | выбор в баннере cookie | state — одно из: accepted, declined |
| `merfy:countdown:end` | таймер `data-behavior="countdown"` дошёл до нуля по времени сервера; section и id — секция с таймером | section — строка; id — строка |
| `merfy:scratch:done` | посетитель стёр слой `data-behavior="scratch"` больше чем наполовину или нажал «Показать»; section и id — секция со слоем | section — строка; id — строка |
| `merfy:overlay:close` | окно секции поверх страницы закрылось: button — data-action="overlay.close", escape — Esc, backdrop — клик мимо окна, code — ctx.overlay.close() | section — строка; id — строка; reason — одно из: button, escape, backdrop, code |

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

