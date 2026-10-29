import { defineSection, type CatalogItem, type El } from '@merfy/shell';

// «Избранное» (блок 10 «Секций и SDK», 10.6, «Решил сам» п. 15; часть 10б, Р10б-12): карточки отмеченных —
// ctx.favorites.$products по <template>, вид карточки — как на проде у flux: подложка, фото, бейдж скидки,
// «Нет в наличии», название и цена внутри карточки; кнопки «В корзину» нет. Удаление из избранного — сердце
// на карточке: favorites.toggle в разметке, скрипт пишет только data-product-id; после снятия стор сам
// обновляет $products. Скелетон и подзаголовок скрываются в любом исходе чтения (грид / пусто).

const fillCard = (row: El, item: CatalogItem): void => {
  const image = row.ref('image');
  const noImage = row.ref('no-image');
  if (item.image === null) {
    image?.hide();
    noImage?.show();
  } else {
    image?.attr('src', item.image);
    image?.attr('alt', item.title);
    image?.show();
    noImage?.hide();
  }
  row.ref('photo-link')?.attr('href', item.url);
  row.ref('link')?.attr('href', item.url);
  row.ref('title')?.text(item.title);
  row.ref('price')?.text(item.price.text);
  const oldPrice = item.compareAtPrice;
  const oldNode = row.ref('old-price');
  const sale = row.ref('sale');
  if (oldPrice === null) {
    oldNode?.hide();
    sale?.hide();
    row.ref('price')?.attr('data-discount', null);
  } else {
    oldNode?.text(oldPrice.text);
    oldNode?.show();
    sale?.text(`−${Math.round((1 - item.price.amount / oldPrice.amount) * 100)} %`);
    sale?.show();
    row.ref('price')?.attr('data-discount', 'true');
  }
  row.ref('card')?.attr('data-available', item.available ? 'true' : 'false');
  row.ref('remove')?.attr('data-product-id', item.id);
};

export default defineSection({
  mount(_el, ctx) {
    ctx.watch(ctx.favorites.$products, (state) => {
      if (!state.ready) return;
      ctx.ref('skeleton')?.hide();
      const empty = ctx.ref('empty');
      const cards = ctx.ref('cards');
      const subtitle = ctx.ref('subtitle');
      const hasCards = state.products.length > 0;
      cards?.list(state.products, fillCard); // и в пусто: прошлые карточки снимаются со страницы
      empty?.toggle(!hasCards);
      subtitle?.toggle(hasCards);
      cards?.toggle(hasCards);
    });
  },
});
