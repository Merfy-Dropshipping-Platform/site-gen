/**
 * Стаб `storefront-data` для проверки регистра имени товара.
 *
 * Зачем. Товары доезжают до секций ДВУМЯ путями: rose и satin читают уже
 * разрешённый каталог из `__merfy.resolved` (его кладёт живой пайплайн), а
 * vanilla, flux и bloom ходят за ним HTTP-запросом к sites-сервису
 * (`/api/sites/:id/storefront-data`) прямо во фронтматтере. В проверке сервиса
 * нет — без стаба три темы из пяти рисуют ПЛЕЙСХОЛДЕР, и проверка «капса нет»
 * молча мерит заглушку вместо имени мерчанта.
 *
 * Подменяется только транспорт: компонент, его разбор данных и разметка не
 * трогаются. Порт 3114 не занимается — на рабочей машине там живой sites.
 *
 * Подключается аргументом узла:
 *   node --import <этот файл> render-theme-sections.mjs <тема> '<jobs>'
 */

/** Смешанный регистр — ровно так имя заведено в админке. */
export const NAME_MARK = "ТестОвый Товар";

const product = (i) => ({
  id: `p${i}`,
  name: i === 1 ? NAME_MARK : `Товар ${i}`,
  title: i === 1 ? NAME_MARK : `Товар ${i}`,
  slug: `tovar-${i}`,
  handle: `tovar-${i}`,
  image: `/p${i}.png`,
  images: [`/p${i}.png`, `/p${i}-b.png`],
  price: 2500,
  basePrice: 2500,
  compareAtPrice: null,
  description: "Описание товара из админки",
  collectionIds: ["col-1"],
});

const PRODUCTS = [1, 2, 3, 4].map(product);

const original = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  if (String(input).includes("storefront-data")) {
    return new Response(
      JSON.stringify({
        product: PRODUCTS[0],
        products: PRODUCTS,
        collections: [
          {
            id: "col-1",
            name: "Хиты",
            slug: "hity",
            image: "/p1.png",
            images: [],
            productIds: PRODUCTS.map((p) => p.id),
          },
        ],
        publications: [],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  return original(input, init);
};
