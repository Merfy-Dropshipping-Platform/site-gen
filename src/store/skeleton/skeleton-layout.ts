/**
 * Раскладка заготовки нового магазина новой темы (решение 7 спеки MCP «Секции и SDK»: «Заготовку нового магазина
 * ставит платформа одной командой: серые секции на всех особых страницах, всё работает»).
 *
 * Какие секции нашей библиотеки стоят на каких особых страницах, в шапке, подвале и «Поверх страниц», плюс своя
 * страница «О нас». Перенесена из merfy-mcp (`knowledge/starter/layout.json`), там она снята с магазина-эталона
 * 3a9626f7 (nova, стенд dev, `merfy_pages outline`, 27.10.2026): только секции библиотеки, без тестовых заготовок
 * стенда; секция «Страница» с продукта убрана (на стенде это проверка лимита). Главная с 28.10 — магазин, а не набор
 * проверок стенда: первый экран, товары магазина и один блок вопросов.
 *
 * Ключ списка — ключ в `sections` ревизии: id особой страницы (packages/storefront-build/special-pages.json) или общий
 * список (`header`, `footer`, `overlay`). Имя секции — без префикса: в магазине она `shop:<имя>`.
 */
import type { MenuItem } from "../../pages/pages.service";
import type { LibraryBlock } from "./skeleton-library";

/** Общие настройки экземпляра секции (ключ `wrapper` в ревизии): «Отступы» сверху и снизу в пикселях, шаг 8. */
export interface SkeletonWrapper {
  padding: { top: number; bottom: number };
}

export interface SkeletonLayout {
  lists: Readonly<Record<string, readonly string[]>>;
  /**
   * Общие настройки отдельных экземпляров: список → имя секции → значение `wrapper`. Остальные экземпляры — без ключа
   * `wrapper`, с отступом темы `py-section` сверху и снизу.
   */
  wrappers?: Readonly<
    Record<string, Readonly<Record<string, SkeletonWrapper>>>
  >;
  /**
   * Правки настроек отдельных экземпляров: список → имя секции → настройки. Остальные — с пустыми настройками, как из
   * «Добавить секцию».
   */
  settings?: Readonly<
    Record<string, Readonly<Record<string, Readonly<Record<string, unknown>>>>>
  >;
  /** Свои блоки отдельных экземпляров вместо блоков по умолчанию: список → имя секции → блоки; `[]` — без блоков. */
  blocks?: Readonly<
    Record<string, Readonly<Record<string, readonly LibraryBlock[]>>>
  >;
  /** Пункты главного меню перед «О нас»: заготовка ставит их, когда создаёт «О нас». */
  menu: readonly MenuItem[];
  about: {
    name: string;
    slug: string;
    section: string;
    settings: Readonly<Record<string, string>>;
    wrapper?: SkeletonWrapper;
  };
}

/** Списки вне страниц: шапка, подвал и «Поверх страниц». */
export const SHARED_LISTS: Readonly<Record<string, string>> = {
  header: "Шапка",
  footer: "Подвал",
  overlay: "Поверх страниц",
};

/**
 * Первая секция страницы стоит сразу под шапкой. Отступ темы (`spacing-section`, у nova до 96 px) сверху давал пустую
 * полосу между шапкой и заголовком; сверху 32 px, снизу 64 px — до подвала.
 */
const PAGE_START: SkeletonWrapper = { padding: { top: 32, bottom: 64 } };

export const SKELETON_LAYOUT: SkeletonLayout = {
  lists: {
    // «Значок корзины» (cart-badge) в заготовку не ставится: значок корзины со счётчиком уже есть в «Шапке»
    // (data-ref="cart-count", header/script.ts), отдельная секция давала лишнюю строку «Корзина» под шапкой.
    // Сама секция остаётся в библиотеке: у старых магазинов она стоит.
    header: ["header"],
    footer: ["footer"],
    // «Поиск» — секция с ролью search: её место — «Поверх страниц» (ROLE_PLACES), на главной сборка её отбрасывает.
    overlay: [
      "notices",
      "search",
      "cart-drawer",
      "cart-added",
      "cookie-banner",
    ],
    // Главная: первый экран, товары магазина и один блок вопросов. Товары — «Каталог» без выбранной коллекции: список
    // всех товаров магазина с заголовком. «Слайд-шоу» и «Вопросы с плавным раскрытием» остаются в библиотеке, в
    // заготовку не ставятся: второй блок вопросов подряд и слайды без картинок новому магазину не нужны.
    home: ["hero", "catalog", "faq"],
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
  // Первые секции страниц — PAGE_START. У «Личного кабинета» и «Заказов» «Отступов» нет (wrapper: ["scheme"]), им
  // значение не ставится. Мерчант меняет всё это в «Отступах» секции.
  wrappers: {
    home: { hero: PAGE_START },
    catalog: { catalog: PAGE_START },
    collection: { collection: PAGE_START },
    product: { product: PAGE_START },
    blog: { blog: PAGE_START },
    article: { article: PAGE_START },
    policy: { page: PAGE_START },
    "not-found": { "error-404": PAGE_START },
    // Страница корзины: «Корзина» и «Промежуточный итог» — две секции подряд; с отступом темы между строками и итогом
    // выходило два отступа секции (~170 px на компьютере). Строки — без отступа снизу, итог — 24 px сверху: итог
    // читается сразу под строками.
    "page-cart": {
      cart: { padding: { top: 32, bottom: 0 } },
      "cart-summary": { padding: { top: 24, bottom: 64 } },
    },
    "page-login": { login: PAGE_START },
    "page-wishlist": { wishlist: PAGE_START },
  },
  // «Каталог» на главной — блок товаров магазина: свой заголовок, 4 колонки на компьютере, без фильтров и сортировки
  // (они нужны странице каталога). На /catalog — как из «Добавить секцию».
  settings: {
    home: { catalog: { heading: "Товары", columns: 4 } },
  },
  blocks: {
    home: { catalog: [] },
  },
  menu: [{ label: "Каталог", url: "/catalog" }],
  about: {
    name: "О нас",
    slug: "/o-nas",
    section: "page",
    settings: { heading: "О нас" },
    wrapper: PAGE_START,
  },
};

/** Все секции заготовки без повторов, в порядке раскладки: их команда копирует в магазин. */
export function skeletonSectionNames(
  layout: SkeletonLayout = SKELETON_LAYOUT,
): string[] {
  const names = [...Object.values(layout.lists).flat(), layout.about.section];
  return [...new Set(names)];
}
