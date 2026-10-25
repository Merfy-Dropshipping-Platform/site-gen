import { defineSection, type CatalogItem, type El } from '@merfy/shell';

// «Избранное» (блок 10 «Секций и SDK», 10.6, «Решил сам» п. 15; часть 10б, Р10б-12): карточки отмеченных —
// ctx.favorites.$products по <template>; «Убрать» — favorites.toggle в разметке, скрипт пишет только data-product-id.

const fillCard = (row: El, item: CatalogItem): void => {
  const image = row.ref('image');
  if (item.image === null) image?.hide();
  else {
    image?.attr('src', item.image);
    image?.show();
  }
  row.ref('link')?.attr('href', item.url);
  row.ref('title')?.text(item.title);
  row.ref('price')?.text(item.price.text);
  const oldPrice = item.compareAtPrice;
  const oldNode = row.ref('old-price');
  if (oldPrice === null) oldNode?.hide();
  else {
    oldNode?.text(oldPrice.text);
    oldNode?.show();
  }
  row.ref('remove')?.attr('data-product-id', item.id);
};

export default defineSection({
  mount(_el, ctx) {
    ctx.watch(ctx.favorites.$products, (state) => {
      if (!state.ready) return;
      const empty = ctx.ref('empty');
      const cards = ctx.ref('cards');
      const hasCards = state.products.length > 0;
      empty?.toggle(!hasCards);
      cards?.toggle(hasCards);
      if (hasCards) cards?.list(state.products, fillCard);
    });
  },
});
