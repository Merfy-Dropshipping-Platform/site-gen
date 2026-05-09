import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
await fs.mkdir('/tmp/e2e-rose/customer', { recursive: true });

const targets = [
  { name: 'home', url: 'https://dde2b0280a90.merfy.ru/' },
  { name: 'catalog', url: 'https://dde2b0280a90.merfy.ru/catalog' },
  { name: 'catalog-urban', url: 'https://dde2b0280a90.merfy.ru/catalog?collection=urban' },
];

for (const t of targets) {
  try {
    const resp = await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `/tmp/e2e-rose/customer/${t.name}.png`, fullPage: true });
    console.log(`${t.name}: ok (status ${resp.status()})`);
  } catch (e) {
    console.log(`${t.name}: ERROR ${e.message}`);
  }
}

// Get product handle from catalog
await page.goto('https://dde2b0280a90.merfy.ru/catalog');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2500);

const handle = await page.$eval('article[data-product-handle]', el => el.getAttribute('data-product-handle')).catch(() => null);
console.log('product handle:', handle);

if (handle) {
  const productUrl = `https://dde2b0280a90.merfy.ru/product/${handle}`;
  await page.goto(productUrl, { waitUntil: 'domcontentloaded' });
  try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/tmp/e2e-rose/customer/product.png', fullPage: true });
  console.log('product:', productUrl);
}

// Note: /collections/urban is a 404 — only /catalog?collection=urban works in this Rose theme
console.log('NOTE: /collections/urban returned 404 — Rose theme uses /catalog?collection=urban only');

await browser.close();
console.log('DONE');
