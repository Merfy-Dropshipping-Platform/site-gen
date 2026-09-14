/**
 * Стаб `storefront-data` для секции «Товар»: один реальный товар с описанием.
 *
 * Зачем. Порт flux (`themes/flux/src/components/sections/FeaturedProduct.astro`)
 * резолвит выбранный товар HTTP-запросом к sites-сервису прямо во фронтматтере
 * (`/api/sites/:id/storefront-data?product=<id>`), а не из `__merfy.catalog`.
 * В проверке сервиса нет: без стаба `realProduct === null`, секция рисует
 * ПЛЕЙСХОЛДЕР, описание не печатается вовсе — и проверка «заголовка нет»
 * проходила бы потому, что нет НИЧЕГО. Это и есть вырожденный тест.
 *
 * Подменяется только транспорт: компонент, его разбор данных и разметка не
 * трогаются. Порт 3114 не занимается — на рабочей машине там живой sites.
 *
 * Подключается аргументом узла:
 *   node --import <этот файл> render-theme-sections.mjs <тема> '<jobs>'
 */

/** Маячок тела описания — «данные тянутся с админки». */
export const DESCRIPTION_MARK = "ОПИСАНИЕ_ИЗ_АДМИНКИ_МАЯЧОК";

const PRODUCT = {
  id: "p1",
  name: "Товар 1",
  slug: "tovar-1",
  image: "/p1.png",
  images: ["/p1.png", "/p1-b.png"],
  price: 2500,
  basePrice: 2500,
  compareAtPrice: null,
  description: DESCRIPTION_MARK,
};

const original = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  if (String(input).includes("storefront-data")) {
    return new Response(
      JSON.stringify({
        product: PRODUCT,
        products: [PRODUCT],
        collections: [],
        publications: [],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  return original(input, init);
};
