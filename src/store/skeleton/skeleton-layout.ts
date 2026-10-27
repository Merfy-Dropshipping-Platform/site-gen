/**
 * Раскладка заготовки нового магазина новой темы (решение 7 спеки MCP «Секции и SDK»: «Заготовку нового магазина
 * ставит платформа одной командой: серые секции на всех особых страницах, всё работает»).
 *
 * Какие секции нашей библиотеки стоят на каких особых страницах, в шапке, подвале и «Поверх страниц», плюс своя
 * страница «О нас». Перенесена из merfy-mcp (`knowledge/starter/layout.json`), там она снята с магазина-эталона
 * 3a9626f7 (nova, стенд dev, `merfy_pages outline`, 27.10.2026): только секции библиотеки, без тестовых заготовок
 * стенда; секция «Страница» с продукта убрана (на стенде это проверка лимита).
 *
 * Ключ списка — ключ в `sections` ревизии: id особой страницы (packages/storefront-build/special-pages.json) или общий
 * список (`header`, `footer`, `overlay`). Имя секции — без префикса: в магазине она `shop:<имя>`.
 */
export interface SkeletonLayout {
  lists: Readonly<Record<string, readonly string[]>>;
  about: {
    name: string;
    slug: string;
    section: string;
    settings: Readonly<Record<string, string>>;
  };
}

/** Списки вне страниц: шапка, подвал и «Поверх страниц». */
export const SHARED_LISTS: Readonly<Record<string, string>> = {
  header: "Шапка",
  footer: "Подвал",
  overlay: "Поверх страниц",
};

export const SKELETON_LAYOUT: SkeletonLayout = {
  lists: {
    // «Значок корзины» (cart-badge) в заготовку не ставится: значок корзины со счётчиком уже есть в «Шапке»
    // (data-ref="cart-count", header/script.ts), отдельная секция давала лишнюю строку «Корзина» под шапкой.
    // Сама секция остаётся в библиотеке: у старых магазинов она стоит.
    header: ["header"],
    footer: ["footer"],
    overlay: ["notices", "cart-drawer", "cart-added", "cookie-banner"],
    home: ["hero", "faq", "slideshow", "questions", "search"],
    catalog: ["catalog"],
    collection: ["collection"],
    product: ["product"],
    blog: ["blog"],
    article: ["article"],
    policy: ["page"],
    "not-found": ["error-404"],
    "page-cart": ["cart", "cart-summary"],
    "page-login": ["login"],
    "page-orders": ["orders"],
    "page-profile": ["account"],
    "page-wishlist": ["wishlist"],
  },
  about: {
    name: "О нас",
    slug: "/o-nas",
    section: "page",
    settings: { heading: "О нас" },
  },
};

/** Все секции заготовки без повторов, в порядке раскладки: их команда копирует в магазин. */
export function skeletonSectionNames(
  layout: SkeletonLayout = SKELETON_LAYOUT,
): string[] {
  const names = [...Object.values(layout.lists).flat(), layout.about.section];
  return [...new Set(names)];
}
