import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();

await page.goto('https://dde2b0280a90.merfy.ru/product/sumka-spring-10');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2500);

// Check window globals/config
const cfg = await page.evaluate(() => ({
  config: window.__MERFY_CONFIG__,
  product: window.__MERFY_PRODUCT__,
  productJSON: document.querySelector('[data-product-json]')?.textContent?.slice(0, 300),
}));
console.log('window globals:', cfg);

// Look for data-product-id on add-to-cart
const addBtn = await page.$('button:has-text("Добавить в корзину")');
if (addBtn) {
  const attrs = await addBtn.evaluate(el => Array.from(el.attributes).map(a => ({ name: a.name, value: a.value })));
  console.log('add btn attrs:', attrs);
  // and the parent
  const parentAttrs = await addBtn.evaluate(el => Array.from(el.parentElement.attributes).map(a => ({ name: a.name, value: a.value })));
  console.log('parent attrs:', parentAttrs);
}

// Look for any data-product-id on the page
const dpids = await page.$$eval('[data-product-id]', els => els.slice(0, 5).map(e => ({
  id: e.getAttribute('data-product-id'),
  tag: e.tagName,
})));
console.log('data-product-id elements:', dpids);

await browser.close();
