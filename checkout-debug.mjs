// Debug: inspect what /checkout actually looks like after hydration
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
  // Create cart with item
  const r1 = await fetch(`${API}/store/carts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store_id: SHOP }),
  });
  const { cart } = await r1.json();
  const cartId = cart.id;
  log('cartId', cartId);

  await fetch(`${API}/store/carts/${cartId}/items`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: PRODUCT, quantity: 1 }),
  });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    locale: 'ru-RU', viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('pageerror:', e.message.slice(0, 300)));
  page.on('console', (m) => {
    if (m.type() === 'error') log('console err:', m.text().slice(0, 300));
    else if (m.type() === 'warning') log('console warn:', m.text().slice(0, 200));
  });
  page.on('response', (r) => {
    if (!r.ok() && r.url().startsWith(SITE)) log('bad', r.status(), r.url());
  });

  await page.goto(SITE + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((id) => {
    localStorage.setItem('merfy:cartId', id);
    localStorage.setItem('merfy_cart_id', id);
  }, cartId);

  await page.goto(SITE + '/checkout', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500); // hydration

  // Save HTML snapshot of the contact + delivery + delivery-method sections
  const dump = await page.evaluate(() => {
    const blocks = ['contact', 'delivery', 'delivery-method'];
    const out = {};
    for (const b of blocks) {
      const el = document.querySelector(`[data-checkout-slot="${b}"]`);
      out[b] = el ? el.outerHTML : '(missing)';
    }
    out._url = location.href;
    out._inputs = Array.from(document.querySelectorAll('input')).map((i) => ({
      name: i.name, type: i.type, visible: i.offsetParent !== null, autocomplete: i.autocomplete,
      placeholder: i.placeholder,
    }));
    out._cityField = document.querySelector('[data-checkout-field="city"]')?.outerHTML ?? '(no city field)';
    return out;
  });

  fs.writeFileSync(`${OUT}/debug-dump.json`, JSON.stringify(dump, null, 2));
  log('dump saved. url=', dump._url);
  log('inputs found:', dump._inputs.length);
  for (const i of dump._inputs) log(' ', i.name || '(noname)', 'type=', i.type, 'visible=', i.visible);

  await page.screenshot({ path: `${OUT}/debug-viewport.png`, fullPage: false });
  await browser.close();
})();
