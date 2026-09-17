/**
 * Shared cart-drawer globals resolver — extracted VERBATIM from the two
 * byte-identical duplicates (F-054):
 *   - PreviewController.cartDrawerGlobalsFromRevision
 *   - BuildService (live) inline cart-drawer block
 *
 * Both `PreviewController` and `BuildService` must consume this neutral export
 * so preview and live stay byte-for-byte identical.
 *
 * Contract (F-052, расширен 13.09 по просьбе владельца):
 *   - scheme: настройка темы `cartDrawerScheme` («Настройки темы» → «Корзина» →
 *     «Цветовая схема» при виде корзины «Сайдбар»); если её нет — первый
 *     валидный `scheme-\d+` из page-cart CartBody, иначе CartSummary
 *   - a valid scheme adds the COUPLED pair SCHEME + fixed DISCLAIMER
 *   - TITLE/CHECKOUT/EMPTY are added INDEPENDENTLY only for non-empty trimmed
 *     theme-setting strings (cartDrawerTitle / cartDrawerCheckoutText /
 *     cartDrawerEmptyText)
 *   - the result therefore holds any subset from 0 through 5 exact
 *     `__MERFY_CART_DRAWER_*__` globals
 */

/**
 * Fixed cart-drawer disclaimer coupled with a valid scheme. Identical literal
 * used by both the live build and preview today.
 */
export const CART_DRAWER_DISCLAIMER =
  "Налоги, скидки и стоимость доставки рассчитываются при оформлении заказа.";

interface CartDrawerRevisionShape {
  pagesData?: Record<
    string,
    { content?: Array<{ type?: string; props?: { colorScheme?: unknown } }> }
  >;
  themeSettings?: {
    cartDrawerScheme?: unknown;
    cartDrawerTitle?: unknown;
    cartDrawerCheckoutText?: unknown;
    cartDrawerEmptyText?: unknown;
  };
}

/**
 * Резолвит ИД схемы дровера (`"scheme-N"`) по тем же правилам, что и весь
 * контракт: явная настройка `themeSettings.cartDrawerScheme`, иначе —
 * `colorScheme` секции CartBody страницы `page-cart`, иначе — CartSummary.
 * `undefined`, если ни одного валидного источника нет.
 *
 * Вынесено отдельно от {@link resolveCartDrawerGlobals}, потому что у
 * `buildTokensCss` (см. `tokens-css.ts`) есть СВОЙ, более старый канал
 * покраски дровера — CSS-правило вне `@layer`, единственное, что реально
 * перебивает утилиту `bg-white` на панели (см. комментарий в tokens-css.ts
 * рядом с `cartDrawerPaintRule`). Раньше это правило читало ТОЛЬКО явную
 * настройку `s.cartDrawerScheme` — без фолбэка на CartBody, которым дровер
 * пользовался для window-глобала. Итог: у магазина, где мерчант просто выбрал
 * схему НА СТРАНИЦЕ корзины (обычный путь — отдельная настройка дровера почти
 * никем не трогается), класс `.color-scheme-N` на дровер вешался (mechanism
 * 1), но красящее правило (mechanism 2) не рождалось — и панель оставалась
 * белой. Баг тестера 17.09 «Корзина — не применяется цветовая схема».
 */
export function resolveCartDrawerSchemeId(data: unknown): string | undefined {
  try {
    const rev = data as CartDrawerRevisionShape | null;
    const cartContent = rev?.pagesData?.["page-cart"]?.content;
    // 18.09, баг тестера №20 («цв схема не применяется к заголовку, цене…»,
    // третий заход): этот резолвер принимал ТОЛЬКО полную строку "scheme-N" —
    // ровно тот же паттерн `typeof v === 'string'`, который уже задокументирован
    // как системная дыра в `packages/theme-base/runtime/color-scheme.ts`
    // (`schemeIdOf`/`schemeClassOf`): панель конструктора шлёт "scheme-2" ИЛИ
    // голую "1" (разные контролы), а живая нормализация ревизии переводит это
    // в ЧИСЛО. CartBody.astro каждой темы уже переживает оба случая
    // (`String(colorScheme ?? 2).replace('scheme-','')` — замер live/tokens.css
    // подтвердил `color-scheme-2` на секции), а ЭТОТ резолвер — нет: число/голую
    // строку отбрасывал молча, `cartDrawerPaintRule` не рождался, и панель
    // дровера (фон/заголовок/итого/кнопки) навсегда оставалась на литералах
    // NtCartDrawer.astro (#000000/#999999/bg-white) независимо от схемы
    // страницы «Корзина». Живой замер (u9fpo33bkmsd.merfy.ru, флюкс): секция
    // CartBody несёт `color-scheme-2`, а `tokens.css` не содержит ни одного
    // правила `cart-drawer` — то есть резолвер молчал именно так.
    const validScheme = (v: unknown): string | undefined => {
      if (typeof v === "number" && Number.isFinite(v)) return `scheme-${v}`;
      if (typeof v === "string") {
        if (/^scheme-\d+$/.test(v)) return v;
        if (/^\d+$/.test(v)) return `scheme-${v}`;
      }
      return undefined;
    };
    const findScheme = (t: string): string | undefined => {
      const blk = Array.isArray(cartContent)
        ? cartContent.find((b) => b?.type === t)
        : undefined;
      return validScheme(blk?.props?.colorScheme);
    };
    const ts = rev?.themeSettings;
    // Настройка темы — ИСТОЧНИК; блоки корзины остаются запасным вариантом.
    // Владелец 13.09 просил схему сайдбара именно в «Настройках темы» → там
    // мерчант её и ищет. Порядок (а не замена) выбран сознательно: пока
    // страница корзины была схлопнута в один блок, схема до дровера не
    // доезжала вовсе; магазины, где она выбрана в CartBody/CartSummary, после
    // этой правки продолжают работать ровно как раньше.
    return (
      validScheme(ts?.cartDrawerScheme) ??
      findScheme("CartBody") ??
      findScheme("CartSummary")
    );
  } catch {
    return undefined;
  }
}

/**
 * Resolve the cart-drawer window globals from a revision's `data`. Returns a
 * (possibly empty) record of `__MERFY_CART_DRAWER_*__` → string.
 *
 * Never throws: any structural surprise yields `{}` (theme default drawer).
 */
export function resolveCartDrawerGlobals(
  data: unknown,
): Record<string, string> {
  const g: Record<string, string> = {};
  try {
    const rev = data as CartDrawerRevisionShape | null;
    const scheme = resolveCartDrawerSchemeId(data);
    const ts = rev?.themeSettings;
    const trim = (v: unknown): string | undefined =>
      typeof v === "string" && v.trim() ? v.trim() : undefined;
    if (scheme) {
      g.__MERFY_CART_DRAWER_SCHEME__ = scheme;
      g.__MERFY_CART_DRAWER_DISCLAIMER__ = CART_DRAWER_DISCLAIMER;
    }
    const t = trim(ts?.cartDrawerTitle);
    if (t) g.__MERFY_CART_DRAWER_TITLE__ = t;
    const c = trim(ts?.cartDrawerCheckoutText);
    if (c) g.__MERFY_CART_DRAWER_CHECKOUT__ = c;
    const e = trim(ts?.cartDrawerEmptyText);
    if (e) g.__MERFY_CART_DRAWER_EMPTY__ = e;
  } catch {
    /* пусто — дефолт темы */
  }
  return g;
}
