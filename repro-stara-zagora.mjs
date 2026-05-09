// Repro: пользователь вводит "Самара, Стара Загора, 16"
import { chromium } from 'playwright';
import fs from 'fs';

const OUT = '/tmp/repro';
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log('[repro]', ...a);
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
});
const page = await ctx.newPage();
page.on('pageerror', e => log('pageerror:', e.message.slice(0,150)));

let calcResp = null, calcUrl = null;
page.on('response', async r => {
  if (r.url().includes('/delivery/calculate')) {
    calcUrl = r.url();
    try { calcResp = await r.json(); } catch {}
    log('CALC', r.status(), r.url());
  }
});

await page.goto(SITE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.evaluate(id => {
  localStorage.setItem('merfy:cartId', id);
  localStorage.setItem('merfy_cart_id', id);
}, cartId);
await page.goto(SITE + '/checkout', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('[data-checkout-slot="contact"]', { timeout: 15000 });
await page.waitForTimeout(2500);

// Fill contact
await page.locator('input#email').fill('test@test.ru');
await page.locator('input#phone').fill('+79991234567');
await page.locator('input[autocomplete="given-name"]').fill('Иван');
await page.locator('input[autocomplete="family-name"]').fill('Иванов');

// Type EXACTLY what user typed
log('typing exact user input...');
const addr = page.locator('input[autocomplete="street-address"]').first();
await addr.waitFor({ state: 'visible', timeout: 20000 });
await addr.click();
await addr.fill('');
await addr.type('Самара, Стара Загора, 16', { delay: 100 });
await page.waitForTimeout(2500);

// Take screenshot of dropdown state
await page.screenshot({ path: `${OUT}/dropdown.png` });

// Try clicking the FIRST suggestion (д 16 specifically)
const lis = await page.locator('ul li:visible').all();
log('suggestions visible:', lis.length);
for (let i = 0; i < Math.min(lis.length, 5); i++) {
  const text = await lis[i].textContent();
  log('  ' + i + ':', text?.slice(0, 80));
}

if (lis.length > 0) {
  // Click first suggestion (д 16)
  const box = await lis[0].boundingBox();
  await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
  await page.mouse.down(); await page.waitForTimeout(50); await page.mouse.up();
  log('clicked first suggestion');
}

await page.waitForTimeout(3000);

// Check current state
const state = await page.evaluate(() => {
  const addrInput = document.querySelector('input[autocomplete="street-address"]');
  const indexInput = document.querySelector('input[autocomplete="postal-code"]');
  return {
    address: addrInput?.value,
    postalCode: indexInput?.value,
  };
});
log('state:', JSON.stringify(state));

await page.screenshot({ path: `${OUT}/after.png`, fullPage: false });

const section = page.locator('[data-checkout-slot="delivery-method"]').first();
await section.scrollIntoViewIfNeeded().catch(() => {});
await section.screenshot({ path: `${OUT}/delivery.png` });

const choices = await page.$$eval('[data-checkout-slot="delivery-method"] label',
  els => els.map(e => e.textContent?.trim().replace(/\s+/g, ' '))
).catch(() => []);
const message = await page.$eval('[data-checkout-slot="delivery-method"] p',
  e => e.textContent?.trim()
).catch(() => null);
log('message:', message ?? '(none)');
log('choices:', JSON.stringify(choices));
log('calcUrl:', calcUrl);
if (calcResp) log('api:', JSON.stringify(calcResp).slice(0, 300));


await ctx.close(); await browser.close();
