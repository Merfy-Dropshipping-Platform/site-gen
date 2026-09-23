/**
 * Стаб `storefront-data` для замера макетов галереи «Товар».
 *
 * Зачем. Товары доезжают до секций ДВУМЯ путями: rose и satin читают готовый
 * каталог из `__merfy.resolved`, а vanilla, flux и bloom ходят за ним HTTP-
 * запросом во фронтматтере. Без стаба три темы из пяти рисуют ПЛЕЙСХОЛДЕР —
 * одну картинку, — и разница между макетами «Сложенный»/«Карусель»/«2 колонки»
 * исчезает: мерить будет нечего (замер 15.09 дал thumbCount 0 у всех пяти).
 *
 * Шесть изображений — минимум, на котором видно и сетку, и ряд миниатюр, и
 * ограничение «первые пять».
 *
 * Подключается аргументом узла:
 *   node --import <этот файл> render-theme-sections.mjs <тема> '<jobs>'
 */
const IMAGES = [1, 2, 3, 4, 5, 6].map((i) => `/p1-${i}.png`);

const product = (i) => ({
  id: `p${i}`,
  name: `Товар ${i}`,
  title: `Товар ${i}`,
  slug: `tovar-${i}`,
  handle: `tovar-${i}`,
  image: IMAGES[0],
  images: i === 1 ? IMAGES : [`/p${i}.png`],
  price: 2500,
  basePrice: 2500,
  compareAtPrice: 3500,
  description: "Описание товара для замера макетов галереи.",
  collectionIds: ["col-1"],
});

const PRODUCTS = [1, 2, 3, 4].map(product);

// Товар с вариантами для проверок «страница товара → корзина»: подкладывается
// переменной окружения MERFY_QA_STUB_PRODUCT (JSON). Встаёт первым, остальные
// товары остаются — секции, которым нужен список, его получают как раньше.
if (process.env.MERFY_QA_STUB_PRODUCT) {
  try {
    PRODUCTS.unshift(JSON.parse(process.env.MERFY_QA_STUB_PRODUCT));
  } catch {
    /* битый JSON — остаёмся на стандартных товарах */
  }
}
const original = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  if (String(input).includes("storefront-data")) {
    return new Response(
      JSON.stringify({
        product: PRODUCTS[0],
        products: PRODUCTS,
        collections: [
          { id: "col-1", name: "Хиты", slug: "hity", image: IMAGES[0], images: [], productIds: PRODUCTS.map((p) => p.id) },
        ],
        publications: [],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  return original(input, init);
};
