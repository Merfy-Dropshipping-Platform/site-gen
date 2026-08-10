#!/usr/bin/env node
// Скрины: эталон верстальщиков /products/<id> vs превью flux page=product.
import { chromium } from 'playwright';

const b = await chromium.launch({ headless: true });
const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });

// эталон: берём первую товарную ссылку с каталога
await pg.goto('http://localhost:4321/catalog', { waitUntil: 'load', timeout: 20000 }).catch(() => {});
const href = await pg.evaluate(() => document.querySelector('a[href*="/products/"]')?.getAttribute('href'));
console.log('эталон-ссылка:', href);
if (href) {
  await pg.goto('http://localhost:4321' + href, { waitUntil: 'load', timeout: 20000 }).catch(() => {});
  await pg.waitForTimeout(1200);
  await pg.screenshot({ path: '/tmp/pdp-etalon.png' });
}

await pg.goto('http://localhost:3110/api/sites/132d3a3e-a28f-40b7-98fa-a0200151cfb8/preview?page=product', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
await pg.waitForTimeout(2000);
await pg.screenshot({ path: '/tmp/pdp-flux-preview.png' });
console.log('превью снят');
await b.close();
