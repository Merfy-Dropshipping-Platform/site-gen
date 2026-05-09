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
  { name: 'collection-urban', url: 'https://dde2b0280a90.merfy.ru/collections/urban' },
];

for (const t of targets) {
  try {
    const resp = await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const status = resp ? resp.status() : 'no-response';
    try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `/tmp/e2e-rose/customer/${t.name}.png`, fullPage: true });
    console.log(`${t.name}: ok (status ${status})`);
  } catch (e) {
    console.log(`${t.name}: ERROR ${e.message}`);
  }
}

// Find first product slug
try {
  await page.goto('https://dde2b0280a90.merfy.ru/catalog');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2500);
  const productHref = await page.$eval('a[href^="/product/"]', el => el.getAttribute('href')).catch(() => null);
  console.log('first productHref:', productHref);
  if (productHref) {
    await page.goto(`https://dde2b0280a90.merfy.ru${productHref}`, { waitUntil: 'domcontentloaded' });
    try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
    await page.waitForTimeout(2500);
    await page.screenshot({ path: '/tmp/e2e-rose/customer/product.png', fullPage: true });
    console.log('product:', productHref);
  }
} catch (e) {
  console.log('product capture ERROR:', e.message);
}

await browser.close();
console.log('DONE');
