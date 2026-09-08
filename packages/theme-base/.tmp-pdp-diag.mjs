import { chromium } from 'playwright';
const URL = 'https://1dw339dxomuy.merfy.ru/product/tovar';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const netErrs = [];
page.on('requestfailed', (r) => { if (/store\/products|storefront-data/.test(r.url())) netErrs.push({ url: r.url().slice(0, 80), err: r.failure()?.errorText }); });
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);
const diag = await page.evaluate(async () => {
  const r = { siteId: window.__MERFY_SITE_ID__, theme: window.__MERFY_THEME__, defaultPid: window.__MERFY_DEFAULT_PRODUCT_ID__ };
  r.globalProducts = (window.__MERFY_PRODUCTS__ || []).map((p) => ({ h: p.handle || p.slug, vc: (p.variantCombinations || []).length }));
  try {
    const resp = await fetch('https://gateway.merfy.ru/api/store/products?store_id=' + window.__MERFY_SITE_ID__ + '&limit=100', { credentials: 'omit' });
    r.fetchOk = resp.ok; r.fetchStatus = resp.status;
    const d = await resp.json();
    const list = d.products || (d.data && d.data.products) || [];
    r.apiCount = list.length;
    const t = list.find((p) => (p.handle || p.slug) === 'tovar' || p.id === '654a2ecf-ba4c-4db1-9aad-3c9b72b19ab9');
    r.apiTovar = t ? { name: t.title || t.name, base: t.basePrice, vc: (t.variantCombinations || []).length, vc0: (t.variantCombinations || [])[0] } : 'NOT FOUND';
  } catch (e) { r.fetchErr = String(e).slice(0, 200); }
  return r;
});
diag.netErrs = netErrs;
console.log(JSON.stringify(diag, null, 1));
await browser.close();
