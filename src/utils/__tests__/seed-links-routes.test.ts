import { migrateVanillaHomePage } from "../revision-migrations";

/**
 * Баг тестера #2 (18.09): «Дефолтные пункты меню шапки 404-ят — „Мебель“ →
 * /c/mebel, „Декор“ → /c/dekor. Оба 404, маршрута /c/<slug> на витрине нет».
 * Перепроверка 20.09: форму ссылки сменили на /collections/<slug>, и она снова
 * 404. Повтор 22.09 — тот же класс.
 *
 * ПОЧЕМУ ЛОВИЛОСЬ ТРИЖДЫ. Два прошлых гарда проверяли ФОРМУ ссылки: «похожа на
 * живой маршрут» и «нет буквально mebel/dekor». Обе проверки зелёные на ссылке
 * `/collections/` + `collectionId: 'mebel'` — база и слаг лежат в РАЗНЫХ полях
 * сида и по отдельности выглядят безобидно. Проверять надо не форму, а
 * достижимость: страница /collections/<слаг> пишется сборкой только под
 * коллекции, которые у магазина есть (build.service: per-collection страницы из
 * v2Store.collections), поэтому любой ЗАШИТЫЙ в сид слаг — обещание раздела,
 * которого у магазина может не быть.
 *
 * Замер 22.09 на магазине владельца (7b64b7a527d2, коллекций mebel/dekor нет):
 *   /catalog/mebel            404
 *   /collections/mebel        404
 *   /catalog?collection=mebel 200   ← каталог есть всегда, фильтр просто пуст
 */

/**
 * Маршруты, которые витрина отдаёт у ЛЮБОГО магазина, без оглядки на его
 * товары и коллекции. Всё остальное сид обещать не вправе.
 */
const МАРШРУТЫ_БЕЗ_ДАННЫХ = [
  /^\/$/,
  /^\/catalog(\?|$)/,
  /^\/cart$/,
  /^\/checkout$/,
  /^\/wishlist$/,
  /^\/account(\/|$)/,
  /^\/login$/,
  /^\/register$/,
  /^\/about$/,
  /^\/contacts$/,
  /^\/delivery$/,
  /^\/blog(\/|$)/,
  /^#/,
  /^https?:\/\//,
];

/** Ссылки сида: собственно href-подобные поля. */
function собратьСсылки(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) собратьСсылки(item, out);
    return out;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(
      node as Record<string, unknown>,
    )) {
      if (
        typeof value === "string" &&
        /^(href|link|url|buttonLink|cardLinkBase)$/.test(key) &&
        value.startsWith("/")
      ) {
        out.push(value);
      }
      собратьСсылки(value, out);
    }
    return out;
  }
  return out;
}

/**
 * Ссылки плиток коллекций — база И слаг, как их склеит витрина. Ровно эта
 * склейка и пряталась от прошлых гардов: по отдельности оба поля безобидны.
 */
function ссылкиПлиток(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) ссылкиПлиток(item, out);
    return out;
  }
  if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    const база = typeof o.cardLinkBase === "string" ? o.cardLinkBase : null;
    if (база && Array.isArray(o.collections)) {
      for (const c of o.collections as Array<Record<string, unknown>>) {
        const слаг = c?.collectionId ?? c?.slug ?? c?.id;
        if (typeof слаг === "string" && слаг) out.push(`${база}${слаг}`);
      }
    }
    for (const value of Object.values(o)) ссылкиПлиток(value, out);
    return out;
  }
  return out;
}

const достижима = (href: string): boolean =>
  МАРШРУТЫ_БЕЗ_ДАННЫХ.some((re) => re.test(href));

describe("стартовый контент ведёт только туда, что есть у любого магазина", () => {
  it("vanilla: сид разобран и ссылки в нём найдены", () => {
    const links = собратьСсылки(migrateVanillaHomePage({}, "vanilla"));
    expect(links.length).toBeGreaterThan(5);
  });

  it("vanilla: каждая засеянная ссылка достижима без данных магазина", () => {
    const links = собратьСсылки(migrateVanillaHomePage({}, "vanilla"));
    expect(links.filter((href) => !достижима(href))).toEqual([]);
  });

  it("vanilla: плитки коллекций (база + слаг) тоже достижимы", () => {
    const seeded = migrateVanillaHomePage({}, "vanilla");
    const плитки = ссылкиПлиток(seeded);
    // Плитки в сиде есть — иначе проверка сторожит пустоту.
    expect(плитки.length).toBeGreaterThan(0);
    expect(плитки.filter((href) => !достижима(href))).toEqual([]);
  });

  it("vanilla: ни одного адреса вида /c/<slug>, /catalog/<slug>, /collections/<slug>", () => {
    const seeded = migrateVanillaHomePage({}, "vanilla");
    const все = [...собратьСсылки(seeded), ...ссылкиПлиток(seeded)];
    const поданным = все.filter((h) =>
      /^\/c\/.+|^\/catalog\/.+|^\/collections\/.+|^\/products?\/.+/.test(h),
    );
    expect(поданным).toEqual([]);
  });
});
