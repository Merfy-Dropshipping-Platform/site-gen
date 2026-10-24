## Свой код мерчанта

Свой код на странице магазина (раздел «Свой код» в настройках) слушает те же события на `document`:

```js
document.addEventListener('merfy:cart:add', (event) => {
  const { productId, quantity } = event.detail;
  console.log('в корзине', productId, quantity);
});
```

В секции — `ctx.listen('merfy:cart:add', fn)`: подписка снимается вместе с секцией.
