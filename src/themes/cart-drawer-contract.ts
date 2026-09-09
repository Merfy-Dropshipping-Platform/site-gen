/**
 * Shared cart-drawer globals resolver — extracted VERBATIM from the two
 * byte-identical duplicates (F-054):
 *   - PreviewController.cartDrawerGlobalsFromRevision
 *   - BuildService (live) inline cart-drawer block
 *
 * Both `PreviewController` and `BuildService` must consume this neutral export
 * so preview and live stay byte-for-byte identical.
 *
 * Contract (F-052):
 *   - scheme: first valid `scheme-\d+` from page-cart CartBody, else CartSummary
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
    cartDrawerTitle?: unknown;
    cartDrawerCheckoutText?: unknown;
    cartDrawerEmptyText?: unknown;
  };
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
    const cartContent = rev?.pagesData?.["page-cart"]?.content;
    const findScheme = (t: string): string | undefined => {
      const blk = Array.isArray(cartContent)
        ? cartContent.find((b) => b?.type === t)
        : undefined;
      const s = blk?.props?.colorScheme;
      return typeof s === "string" && /^scheme-\d+$/.test(s) ? s : undefined;
    };
    const scheme = findScheme("CartBody") ?? findScheme("CartSummary");
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
