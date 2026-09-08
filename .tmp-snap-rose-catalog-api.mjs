// Проверка rose-каталога на живом API в gateway-превью.
// Запуск: node .tmp-snap-rose-catalog-api.mjs
import { chromium } from 'playwright';

const siteId = 'f07e4816-3f6d-4c51-a28c-f7b248b0d6d5';
const url = process.argv[2] || `https://gateway.merfy.ru/api/sites/${siteId}/preview?page=catalog`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1900 } });
const errors = [];
const apiCalls = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('request', (r) => { const u = r.url(); if (u.includes('/api/store/products') || u.includes('/api/store/collections')) apiCalls.push(u.replace(/^https?:\/\/[^/]+/, '')); });

console.log('goto', url);
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(6000); // ждём постраничную загрузку API (2 стр × 60) + рендер

const cards = await page.$$eval('[data-nt="rose-product-card"]', (e) => e.length).catch(() => 0);
const count = await page.$eval('[data-nt="catalog-count"]', (e) => e.textContent.trim()).catch(() => null);
const firstName = await page.$eval('[data-nt="rose-product-card"] .rose-product-name', (e) => e.textContent.trim()).catch(() => null);

await page.screenshot({ path: '/tmp/rose-catalog-api.png', fullPage: true });

console.log(JSON.stringify({
  cardsRendered: cards,
  countLabel: count,
  firstProduct: firstName,
  apiStoreCalls: apiCalls.length,
  apiSample: apiCalls.slice(0, 3),
  jsErrors: errors.length,
  errorsSample: errors.slice(0, 4),
}, null, 2));
await browser.close();
