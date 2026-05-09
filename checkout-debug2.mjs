// Debug v2: deep introspection on city input + DaData
import { chromium } from 'playwright';
import fs from 'fs';

const OUT = '/tmp/checkout-e2e';
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log('[dbg]', ...a);
const API = 'https://gateway.merfy.ru/api';
const SITE = 'https://cc3c46622b51.merfy.ru';
const SHOP = 'bfe4f2ec-a240-492b-82ac-851821b888f7';
const PRODUCT = '18f5cf30-b5cc-4021-9ac1-a4dd5e635ee2';

(async () => {
  const r1 = await fetch(`${API}/store/carts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store_id: SHOP }),
  });
  const { cart } = await r1.json();
  await fetch(`${API}/store/carts/${cart.id}/items`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: PRODUCT, quantity: 1 }),
  });
  log('cartId=', cart.id);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    locale: 'ru-RU', viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 Chrome/130 Safari/537.36',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('pageerror:', e.message.slice(0, 200)));
  page.on('console', (m) => {
    if (m.type() === 'error') log('cerr:', m.text().slice(0, 200));
  });
  page.on('request', (r) => {
    const u = r.url();
    if (u.includes('dadata') || u.includes('delivery/calculate')) log('REQ', r.method(), u.slice(0, 120));
  });
  page.on('response', async (r) => {
    const u = r.url();
    if (u.includes('dadata') || u.includes('delivery/calculate')) {
      log('RES', r.status(), u.slice(0, 120));
      try {
        const text = await r.text();
        if (u.includes('dadata')) {
          const j = JSON.parse(text);
          log('  dadata suggestions:', (j?.suggestions || []).slice(0, 3).map((s) => s.value));
        } else {
          log('  calc:', text.slice(0, 300));
        }
      } catch {}
    }
  });

  await page.goto(SITE + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((id) => {
    localStorage.setItem('merfy:cartId', id);
    localStorage.setItem('merfy_cart_id', id);
  }, cart.id);

  await page.goto(SITE + '/checkout', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  // Verify DADATA token
  const tok = await page.evaluate(() => window.__DADATA_TOKEN__);
  log('window.__DADATA_TOKEN__=', tok ? tok.slice(0, 8) + '…' : 'MISSING');

  const cityCount = await page.locator('input[autocomplete="address-level2"]').count();
  log('city input count=', cityCount);

  const city = page.locator('input[autocomplete="address-level2"]').first();
  await city.click();
  await city.type('Москва', { delay: 80 });
  log('typed Москва, sleep 2s');
  await page.waitForTimeout(2500);

  // Dump DOM state
  const after = await page.evaluate(() => {
    const lis = Array.from(document.querySelectorAll('ul li')).slice(0, 20).map((l) => ({
      text: l.textContent?.slice(0, 80),
      visible: l.offsetParent !== null,
    }));
    return {
      visibleUls: Array.from(document.querySelectorAll('ul')).filter((u) => u.offsetParent !== null).length,
      lis,
      cityVal: document.querySelector('input[autocomplete="address-level2"]')?.value,
    };
  });
  log('after type:', JSON.stringify(after, null, 2));

  await page.screenshot({ path: `${OUT}/dbg2-after-type.png` });
  await browser.close();
})();
