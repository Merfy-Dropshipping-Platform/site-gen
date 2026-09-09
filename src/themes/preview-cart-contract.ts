/**
 * Preview-ONLY demo cart seed — extracted VERBATIM from
 * PreviewController.previewCartDemoScript (+ its <head> injection). This is NOT
 * shared with the live build (live carts are real); it exists purely so the
 * constructor preview drawer shows a full design (итог + кнопка «Оформить»)
 * instead of an empty state.
 *
 * Behavior (F-053 / F-058):
 *   - keyed on `<theme>:cart:v1`
 *   - seeds ONLY when localStorage.getItem(key) is falsy (null | '')
 *   - fetches `/api/sites/<site>/storefront-data`, stores ONE real product,
 *     dispatches `<theme>:cart:updated`
 *   - any truthy existing value (incl. literal `[]` or a non-empty invalid
 *     string) prevents seeding; the SAME truthiness check after fetch prevents
 *     a race overwrite
 *   - injected at the FIRST real `<head>` opening (never at an embedded/closing
 *     `</body>` — the nav-agent idiomorph JS already in the HTML contains a
 *     `</body>` literal, so a `/<\/body>/` injector would corrupt it)
 */

/** Regex matching the first real `<head>` opening (with optional attributes). */
const HEAD_OPEN_RE = /<head(\s[^>]*)?>/i;

/**
 * Build the preview-only demo cart seed `<script>` for a site + theme. Pure:
 * output depends only on the two arguments (byte-stable, hashable).
 */
export function buildPreviewCartDemoScript(
  siteId: string,
  themeName: string,
): string {
  const key = `${themeName}:cart:v1`;
  const evUpdated = `${themeName}:cart:updated`;
  return (
    `<script>(function(){try{` +
    `var K=${JSON.stringify(key)};` +
    `if(window.localStorage.getItem(K))return;` +
    `fetch('/api/sites/'+${JSON.stringify(siteId)}+'/storefront-data').then(function(r){return r.json();}).then(function(d){` +
    `var ps=(d&&d.products)||[];var p=ps[0];if(!p)return;` +
    `if(window.localStorage.getItem(K))return;` +
    `var cs=Array.isArray(p.variantCombinations)?p.variantCombinations:[];var c=cs[0]||null;` +
    `var line={id:'preview-demo',productId:String(p.id),quantity:1,name:p.name||'Товар',` +
    `image:(Array.isArray(p.images)&&p.images[0])||'',price:c?Number(c.price):(Number(p.price)||0),` +
    `variant:c?{variantCombinationId:String(c.id)}:{}};` +
    `window.localStorage.setItem(K,JSON.stringify([line]));` +
    `window.dispatchEvent(new CustomEvent(${JSON.stringify(evUpdated)},{detail:[line]}));` +
    `}).catch(function(){});` +
    `}catch(e){}})();</script>`
  );
}

/**
 * Inject the demo script at the first real `<head>` opening. Returns the HTML
 * unchanged when no `<head>` is present. Idempotency is the caller's concern
 * (the controller only calls this once per response).
 */
export function injectPreviewCartDemoScript(
  html: string,
  siteId: string,
  themeName: string,
): string {
  const script = buildPreviewCartDemoScript(siteId, themeName);
  return html.replace(HEAD_OPEN_RE, (m) => `${m}${script}`);
}
