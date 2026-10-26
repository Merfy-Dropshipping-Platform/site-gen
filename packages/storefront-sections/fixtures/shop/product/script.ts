import { defineSection, type Ctx, type El } from '@merfy/shell';

// «Товар» тест-магазина (блок 11 «Секций и SDK», часть 11б-2; design.md 11.6): выбранное сочетание — цена, наличие,
// фото, кнопка «В корзину» и нажатые значения; «Распроданное: Прятать» скрывает значения без сочетания в наличии.
// Фото — как variantImageFor на проде: первое выбранное значение с фото; нет — галерея остаётся на текущем.
// Миниатюры — действие pick, как wireGalleryMediaSwitch на проде (Р15в-4).

// Главное фото — адресом, текущая миниатюра — та, у которой data-src тот же адрес.
function showPhoto(ctx: Ctx, src: string): void {
  const photo = ctx.ref('photo');
  photo?.attr('src', src);
  photo?.attr('hidden', null);
  markThumb(ctx.refs('thumb'), src);
}

function markThumb(thumbs: readonly El[], src: string): void {
  thumbs.forEach((button) => button.attr('aria-current', button.attr('data-src') === src ? 'true' : 'false'));
}

export default defineSection({
  actions: {
    pick(button, ctx) {
      const src = button.attr('data-src');
      if (src !== null) showPhoto(ctx, src);
    },
  },
  mount(_el, ctx) {
    const productId = ctx.ref('buy')?.attr('data-product-id') ?? '';
    const variants = ctx.variants.of(productId);
    if (variants === null) return;
    ctx.watch(variants.$variant, (variant) => {
      if (variant === null) return;
      ctx.ref('price')?.text(variant.price.text);
      ctx.ref('stock')?.text(variant.available ? 'В наличии' : 'Нет в наличии');
      const buy = ctx.ref('buy');
      buy?.attr('data-variant-id', variant.id);
      buy?.attr('disabled', variant.available ? null : '');
      const image = variants.imageFor(variant);
      const photo = ctx.ref('photo');
      if (photo !== null && image !== null) {
        photo.attr('src', image.url);
        photo.attr('hidden', null);
        markThumb(ctx.refs('thumb'), image.url);
      }
      ctx.refs('value').forEach((button) => {
        const value = button.attr('data-value') ?? '';
        button.attr('aria-pressed', variant.options.includes(value) ? 'true' : 'false');
        if (ctx.settings['sold-out'] === 'hide') button.toggle(variants.isAvailable(button.attr('data-group') ?? '', value));
      });
    });
  },
});
