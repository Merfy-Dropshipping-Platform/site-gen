/**
 * Каталог с товаром, У КОТОРОГО ЕСТЬ ВАРИАНТЫ — подменой `fetch`.
 *
 * Зачем отдельный стаб рядом с `storefront-data-stub.mjs`: тот отдаёт товары
 * БЕЗ вариантов, поэтому секция «Товар» на нём рисует пустое состояние и любая
 * проверка образцов вариаций молча меряет заглушку. Набор значений — как на
 * скриншоте тестировщика (размеры XS…XXL + цвета, среди них составное имя
 * «Светло-голубой»).
 *
 * Подменяется только транспорт: оба порта секции («Товар» у flux собственный,
 * у остальных четырёх — theme-base) резолвят товар одним и тем же запросом
 * `/api/sites/:id/storefront-data?product=…` во фронтматтере. Сами компоненты,
 * их разбор данных и разметка не трогаются.
 *
 * Подключается аргументом узла: node --import <этот файл> render-theme-sections.mjs …
 */

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const COLORS = ['Красный', 'Светло-голубой', 'Чёрный'];

const combinations = [];
let n = 0;
for (const size of SIZES) {
  for (const color of COLORS) {
    n += 1;
    combinations.push({
      id: `c${n}`,
      sku: `SKU-${n}`,
      price: 2500,
      available: true,
      options: { Размер: size, Цвет: color },
    });
  }
}

export const VARIANT_PRODUCT = {
  id: 'p1',
  name: 'Свитер',
  slug: 'sviter',
  handle: 'sviter',
  image: '/p1.png',
  images: ['/p1.png', '/p1-b.png'],
  price: 2500,
  basePrice: 2500,
  compareAtPrice: null,
  hasVariants: true,
  variants: combinations,
  variantCombinations: combinations,
};

export const VARIANT_CATALOG = {
  product: VARIANT_PRODUCT,
  products: [VARIANT_PRODUCT],
  collections: [],
  publications: [],
};

const original = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  if (String(input).includes('storefront-data')) {
    return new Response(JSON.stringify(VARIANT_CATALOG), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  return original(input, init);
};
