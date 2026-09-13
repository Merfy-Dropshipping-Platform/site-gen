/**
 * Каталог магазина для рендера секций в проверках — подменой `fetch`.
 *
 * Зачем. Товары доезжают до «Коллекции товаров» ДВУМЯ разными путями, и у тем
 * они разные: rose и satin читают уже разрешённый каталог из `__merfy.resolved`
 * (его кладёт живой пайплайн), а vanilla, flux и bloom ходят за ним HTTP-запросом
 * к sites-сервису (`/api/sites/:id/storefront-data`) прямо во фронтматтере. В
 * проверке сервиса нет, поэтому три темы из пяти рисовали ПЛЕЙСХОЛДЕР-карточки,
 * и проверка карточки товара молча меряла заглушку вместо товара.
 *
 * Подменяется только транспорт: сам компонент, его разбор данных и разметка
 * не трогаются. Порт сервиса не занимается — на 3114 в рабочей машине живёт
 * настоящий sites.
 *
 * Подключается аргументом узла: node --import <этот файл> render-theme-sections.mjs …
 */

export const STOREFRONT_CATALOG = {
  collections: [
    {
      id: "col-1",
      name: "Хиты",
      slug: "hity",
      image: "/p1.png",
      images: [],
      productIds: ["p1", "p2", "p3", "p4"],
    },
  ],
  products: [1, 2, 3, 4].map((i) => ({
    id: `p${i}`,
    name: `Товар ${i}`,
    slug: `tovar-${i}`,
    image: `/p${i}.png`,
    images: [`/p${i}.png`, `/p${i}-b.png`],
    price: 2500 + i * 100,
    basePrice: 2500 + i * 100,
    compareAtPrice: null,
    collectionIds: ["col-1"],
  })),
  publications: [],
};

const original = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  if (String(input).includes("storefront-data")) {
    return new Response(JSON.stringify(STOREFRONT_CATALOG), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  return original(input, init);
};
