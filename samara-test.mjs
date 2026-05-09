// Quick test: Samara address should show pickup + custom (no CDEK)
import { chromium } from 'playwright';
import fs from 'fs';

const OUT = '/tmp/checkout-screens';
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log('[samara]', ...a);
const API = 'https://gateway.merfy.ru/api';
const SHOP = '71f9b323-de3c-4f74-9e08-85c274493735';
const PRODUCT = 'eb66872b-50ae-4d6e-b938-198c157e30a7';
const SITE = 'https://9c1c6fa8be34.merfy.ru';

const r1 = await fetch(`${API}/store/carts`, {
  method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ store_id: SHOP }),
});
const { cart } = await r1.json();
const cartId = cart.id;
log('cartId', cartId);

await fetch(`${API}/store/carts/${cartId}/items`, {
  method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ product_id: PRODUCT, quantity: 1 }),
});

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  locale: 'ru-RU', viewport: { width: 1440, height: 900 },
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/130 Safari/537.36',
});
const page = await ctx.newPage();
page.on('pageerror', e => log('pageerror:', e.message.slice(0,150)));

let calcResp = null;
page.on('response', async r => {
  if (r.url().includes('/delivery/calculate')) {
    try { calcResp = await r.json(); } catch {}
  }
});

// Setup
await page.goto(SITE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.evaluate(id => {
  localStorage.setItem('merfy:cartId', id);
  localStorage.setItem('merfy_cart_id', id);
}, cartId);
await page.goto(SITE + '/checkout', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('[data-checkout-slot="contact"]', { timeout: 15000 });
await page.waitForTimeout(2500);

// Fill contact
const f = (sel, val) => page.locator(sel).first().fill(val).catch(() => {});
await f('input#email', 'test+e2e@merfy.test');
await f('input#phone', '+79991234567');
await f('input[autocomplete="given-name"]', 'Иван');
await f('input[autocomplete="family-name"]', 'Иванов');

// Fill address — city is extracted from DaData suggestion's city_fias_id
log('typing Самара address...');
const addr = page.locator('input[autocomplete="street-address"]').first();
await addr.waitFor({ state: 'visible', timeout: 20000 });
await addr.click(); await addr.fill('');
await addr.type('Самара, Молодогвардейская 210', { delay: 60 });
await page.waitForTimeout(2200);
await page.waitForSelector('ul li:visible', { timeout: 5000 }).catch(() => {});
const lis = await page.locator('ul li:visible').all();
if (lis.length) {
  const box = await lis[0].boundingBox();
  await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
  await page.mouse.down(); await page.waitForTimeout(50); await page.mouse.up();
  log('address suggestion picked');
} else {
  log('WARN: no DaData suggestions shown');
}

// Wait for delivery/calculate
await page.waitForResponse(r => r.url().includes('/delivery/calculate'), { timeout: 12000 })
  .catch(() => log('WARN: no /delivery/calculate response'));
await page.waitForTimeout(2000);

// Capture
const section = page.locator('[data-checkout-slot="delivery-method"]').first();
await section.scrollIntoViewIfNeeded().catch(() => {});
await page.screenshot({ path: `${OUT}/samara-viewport.png`, fullPage: false });
await section.screenshot({ path: `${OUT}/samara-delivery.png` });

const choices = await page.$$eval(
  '[data-checkout-slot="delivery-method"] label',
  els => els.map(e => e.textContent?.trim().replace(/\s+/g, ' '))
).catch(() => []);
const message = await page.$eval(
  '[data-checkout-slot="delivery-method"] p',
  e => e.textContent?.trim()
).catch(() => null);

log('message:', message ?? '(none)');
log('choices:', JSON.stringify(choices));
if (calcResp) log('api: tariffs=', calcResp.data?.tariffs?.length,
  'pickup=', calcResp.data?.pickupAvailable,
  'custom=', calcResp.data?.customProfiles?.length,
  'cdekError=', calcResp.data?.cdekError);

await ctx.close(); await browser.close();
log('saved to', OUT);
