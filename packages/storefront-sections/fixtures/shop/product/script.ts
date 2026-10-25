import { defineSection } from '@merfy/shell';

// «Товар» тест-магазина (блок 11 «Секций и SDK», часть 11б-2; design.md 11.6): выбранное сочетание — цена, наличие,
// кнопка «В корзину» и нажатые значения; «Распроданное: Прятать» скрывает значения без сочетания в наличии.
export default defineSection({
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
      ctx.refs('value').forEach((button) => {
        const value = button.attr('data-value') ?? '';
        button.attr('aria-pressed', variant.options.includes(value) ? 'true' : 'false');
        if (ctx.settings['sold-out'] === 'hide') button.toggle(variants.isAvailable(button.attr('data-group') ?? '', value));
      });
    });
  },
});
