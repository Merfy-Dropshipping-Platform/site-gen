import { chromium } from 'playwright';

const SITE = 'https://dde2b0280a90.merfy.ru';
const log = (m) => console.log(`[dom] ${m}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

await page.goto(`${SITE}/product/sumka-spring-10`, { waitUntil: 'domcontentloaded' });
await page.waitForLoadState('networkidle').catch(() => {});
await page.waitForTimeout(3000);

const info = await page.evaluate(() => {
  const out = {};
  // Search for product UUID-like strings on the page
  const html = document.documentElement.outerHTML;
  const uuidMatches = html.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || [];
  out.uuids = [...new Set(uuidMatches)].slice(0, 20);
  // Check window vars
  out.merfyConfig = window.__MERFY_CONFIG__;
  out.productData = window.__MERFY_PRODUCT__;
  out.allMerfyKeys = Object.keys(window).filter((k) => /merfy|MERFY/i.test(k));
  // Look for data attributes
  out.dataProductId = document.querySelector('[data-product-id]')?.getAttribute('data-product-id');
  out.dataProductHandle = document.querySelector('[data-product-handle]')?.getAttribute('data-product-handle');
  // Add to Cart button data
  const btn = Array.from(document.querySelectorAll('button')).find((b) => /Добавить в корзину/.test(b.textContent || ''));
  if (btn) {
    out.addBtnAttrs = Array.from(btn.attributes).reduce((a, b) => { a[b.name] = b.value.substring(0, 100); return a; }, {});
    out.addBtnData = Object.entries(btn.dataset || {}).reduce((a, [k, v]) => { a[k] = String(v).substring(0, 100); return a; }, {});
  }
  return out;
});
console.log(JSON.stringify(info, null, 2));

await browser.close();
