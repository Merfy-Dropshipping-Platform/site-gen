import { defineSection, type Ctx, type El } from '@merfy/shell';

// «Товар»: выбранное сочетание вариантов (variants) — цена, старая цена, плашка скидки, наличие, кнопки покупки, фото
// и нажатые значения; «Распроданное: Прятать» скрывает значения без сочетания в наличии. Фото — как variantImageFor на
// проде: первое выбранное значение с фото; нет — галерея остаётся на текущем. Листание фото — миниатюры (pick) и
// стрелки (prev, next); свайп по фото — поведение card-photos. «Купить сейчас» — добавить товар и перейти в оформление.

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

// Соседнее фото ленты; фото вне ленты (фото значения варианта) — шаг считается от начала.
function stepPhoto(ctx: Ctx, step: number): void {
  const sources = ctx.refs('thumb').map((button) => button.attr('data-src') ?? '');
  if (sources.length === 0) return;
  const at = sources.indexOf(ctx.ref('photo')?.attr('src') ?? '');
  const next = Math.min(sources.length - 1, Math.max(0, at + step));
  const target = sources[next];
  if (target !== undefined && target !== '') showPhoto(ctx, target);
}

// Количество: «−» и «+» меняют число и data-quantity обеих кнопок покупки (cart.add и «Купить сейчас» берут штуки из
// него), от 1 до 99.
const QUANTITY_MIN = 1;
const COPIED_MS = 1500;
const QUANTITY_MAX = 99;

function changeQuantity(ctx: Ctx, step: number): void {
  const shown = Number(ctx.ref('quantity')?.text() ?? QUANTITY_MIN);
  const current = Number.isInteger(shown) ? shown : QUANTITY_MIN;
  const next = Math.min(QUANTITY_MAX, Math.max(QUANTITY_MIN, current + step));
  ctx.ref('quantity')?.text(next);
  buyButtons(ctx).forEach((button) => button.attr('data-quantity', String(next)));
  ctx.ref('less')?.attr('disabled', next <= QUANTITY_MIN ? '' : null);
  ctx.ref('more')?.attr('disabled', next >= QUANTITY_MAX ? '' : null);
}

function buyButtons(ctx: Ctx): readonly El[] {
  return [ctx.ref('buy'), ctx.ref('buy-now')].flatMap((button) => (button === null ? [] : [button]));
}

// Плашка скидки: процент от цены и старой цены выбранного сочетания; старой цены нет — плашки и зачёркнутой цены нет.
function showDiscount(ctx: Ctx, price: number, compareAt: { amount: number; text: string } | null): void {
  const onSale = compareAt !== null && compareAt.amount > price;
  const compare = ctx.ref('compare');
  compare?.text(onSale ? compareAt.text : '');
  compare?.toggle(onSale);
  const badge = ctx.ref('badge');
  badge?.text(onSale ? `−${Math.round((1 - price / compareAt.amount) * 100)} %` : '');
  badge?.toggle(onSale);
  const priceEl = ctx.ref('price');
  priceEl?.toggleClass('text-sale', onSale);
  priceEl?.toggleClass('text-price', !onSale);
}

function markHearts(hearts: readonly El[], ids: readonly string[]): void {
  for (const heart of hearts) heart.attr('aria-pressed', String(ids.includes(heart.attr('data-product-id') ?? '')));
}

// Выпадающий список группы: подпись и образец выбранного значения.
function showCurrent(ctx: Ctx, button: El): void {
  const group = button.attr('data-group');
  const value = button.attr('data-value');
  ctx.refs('current').forEach((label) => {
    if (label.attr('data-group') === group) label.text(button.attr('data-label') ?? '');
  });
  // Образец у каждого значения свой (fill код секции не пишет): показан образец выбранного, у значения без цвета — никакой.
  ctx.refs('current-swatch').forEach((box) => {
    if (box.attr('data-group') === group) box.toggle(box.attr('data-value') === value);
  });
}

export default defineSection({
  actions: {
    pick(button, ctx) {
      const src = button.attr('data-src');
      if (src !== null) showPhoto(ctx, src);
    },
    prev(_button, ctx) {
      stepPhoto(ctx, -1);
    },
    next(_button, ctx) {
      stepPhoto(ctx, 1);
    },
    less(_button, ctx) {
      changeQuantity(ctx, -1);
    },
    more(_button, ctx) {
      changeQuantity(ctx, 1);
    },
    async buy(button, ctx) {
      const variantId = button.attr('data-variant-id');
      const added = await ctx.cart.add({
        productId: button.attr('data-product-id') ?? '',
        ...(variantId === null ? {} : { variantId }),
        quantity: Number(button.attr('data-quantity') ?? QUANTITY_MIN),
      });
      if (added.ok) await ctx.cart.checkout();
    },
    // «Поделиться»: окно системы или адрес в буфер обмена; после копирования подпись на 1,5 с — «Ссылка скопирована».
    async share(button, ctx) {
      const shared = await ctx.share.page();
      const label = ctx.ref('share-label');
      if (!shared.ok || shared.data.method !== 'copy' || label === null) return;
      const own = label.text();
      label.text(button.attr('data-copied') ?? own);
      ctx.after(COPIED_MS, () => label.text(own));
    },
  },
  mount(_el, ctx) {
    ctx.watch(ctx.favorites.$favorites, (state) => markHearts(ctx.refs('heart'), state.ids));
    const productId = ctx.ref('buy')?.attr('data-product-id') ?? ctx.ref('buy-now')?.attr('data-product-id') ?? '';
    const variants = ctx.variants.of(productId);
    if (variants === null) return;
    ctx.watch(variants.$variant, (variant) => {
      if (variant === null) return;
      ctx.ref('price')?.text(variant.price.text);
      showDiscount(ctx, variant.price.amount, variant.compareAtPrice);
      ctx.ref('stock')?.text(variant.available ? 'В наличии' : 'Нет в наличии');
      buyButtons(ctx).forEach((button) => {
        button.attr('data-variant-id', variant.id);
        button.attr('disabled', variant.available ? null : '');
      });
      const image = variants.imageFor(variant);
      if (image !== null) showPhoto(ctx, image.url);
      ctx.refs('value').forEach((button) => {
        const value = button.attr('data-value') ?? '';
        const pressed = variant.options.includes(value);
        const available = variants.isAvailable(button.attr('data-group') ?? '', value);
        button.attr('aria-pressed', String(pressed));
        button.attr('data-available', String(available));
        if (pressed) showCurrent(ctx, button);
        if (ctx.settings['sold-out'] === 'hide') button.toggle(available || pressed);
      });
      ctx.refs('menu').forEach((menu) => menu.attr('open', null));
    });
  },
});
