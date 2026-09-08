// Скриншот-пруф родного vanilla-каталога в gateway-preview (is:inline гидрация
// отрабатывает в реальном браузере). Запуск из backend/services/sites:
//   node .tmp-snap-vanilla-catalog.mjs <siteId>
import { chromium } from 'playwright';

const siteId = process.argv[2] || '7f661f30-6e93-414e-a4d2-0266b2df2053';
const url = `https://gateway.merfy.ru/api/sites/${siteId}/preview?page=catalog`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1700 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

console.log('goto', url);
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(4000); // ждём is:inline hydrateCatalog (fetch storefront-data)

const section = await page.$$eval('[data-nt="vanilla-catalog-section"]', (e) => e.length).catch(() => 0);
const cards = await page.$$eval('[data-nt="vanilla-product-card"]', (e) => e.length).catch(() => 0);
const filters = await page.$$eval('[data-nt="catalog-filters"], [data-nt="vanilla-filter-sidebar"]', (e) => e.length).catch(() => 0);
const layout = await page.$eval('[data-catalog-layout]', (e) => e.getAttribute('data-catalog-layout')).catch(() => null);
const count = await page.$eval('[data-nt="catalog-count"]', (e) => e.textContent.trim()).catch(() => null);

await page.screenshot({ path: '/tmp/vanilla-catalog.png', fullPage: true });

console.log(JSON.stringify({ section, cards, filters, layout, count, jsErrors: errors.length, errorsSample: errors.slice(0, 5) }, null, 2));
await browser.close();
