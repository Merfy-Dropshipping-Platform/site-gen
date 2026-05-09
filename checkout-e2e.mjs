// E2E: verify CDEK + pickup + custom delivery options render on /checkout
// Strategy: pre-create cart via public API, inject cartId into localStorage,
// then drive the UI from /checkout only — bypasses flaky homepage navigation.
import { chromium } from 'playwright';
import fs from 'fs';

const OUT = '/tmp/checkout-e2e';
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log('[e2e]', ...a);
const API = 'https://gateway.merfy.ru/api';

const targets = [
  {
    label: 'cdek-pickup',
    site: 'https://cc3c46622b51.merfy.ru',
    shopId: 'bfe4f2ec-a240-492b-82ac-851821b888f7',
    productId: '18f5cf30-b5cc-4021-9ac1-a4dd5e635ee2', // "Футболка хлопковая"
  },
  {
    label: 'custom',
    site: 'https://4692bbed7524.merfy.ru',
    shopId: 'ded99918-b38b-4e94-af06-1ba69b64b292',
    productId: '28bc49de-f33f-474b-aa20-ef99a1abac99', // "Кепка"
  },
];

async function createCart(shopId, productId) {
  log('  POST /carts');
  const r1 = await fetch(`${API}/store/carts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store_id: shopId }),
  });
  const j1 = await r1.json();
  if (!j1?.cart?.id) throw new Error('createCart failed: ' + JSON.stringify(j1));
  const cartId = j1.cart.id;
  log('  cartId=', cartId);

  log('  POST /carts/:id/items');
  const r2 = await fetch(`${API}/store/carts/${cartId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: productId, quantity: 1 }),
  });
  const j2 = await r2.json();
  if (!j2?.item) log('  WARN addItem:', JSON.stringify(j2).slice(0, 300));
  return cartId;
}

async function fillCheckout(page) {
  await page.waitForSelector('[data-checkout-slot="contact"]', { timeout: 15_000 });
  // After React Island hydration, inputs use id/autocomplete instead of name
  const f = async (sel, val) => {
    const loc = page.locator(sel).first();
    if (await loc.count()) {
      await loc.fill(val).catch(async () => {
        await loc.click({ timeout: 3_000 }).catch(() => {});
        await loc.type(val, { delay: 30 });
      });
    } else {
      log('  selector missed:', sel);
    }
  };

  await f('input#email', 'test+e2e@merfy.test');
  await f('input#phone', '+79991234567');
  await f('input[autocomplete="given-name"]', 'Иван');
  await f('input[autocomplete="family-name"]', 'Иванов');

  // City — type and wait for DaData suggestions, click first
  const city = page.locator('input[autocomplete="address-level2"]').first();
  await city.click({ timeout: 5_000 });
  await city.fill('');
  await city.type('Москва', { delay: 60 });
  await page.waitForTimeout(1800);
  // DaData portal suggestions render as siblings — try multiple selectors
  // DaData renders a plain <ul><li> inside the city field's relative wrapper.
  // Wait for the LI to appear, then mousedown (which is what onMouseDown listens for).
  await page.waitForSelector('ul li', { state: 'visible', timeout: 5_000 }).catch(() => {});
  const cityPick = page.locator('ul li:visible').filter({ hasText: 'Москва' }).first();
  if (await cityPick.count()) {
    log('  pick city');
    await cityPick.click({ timeout: 3_000 }).catch(() => {});
  } else {
    log('  no city suggestion picker, ArrowDown+Enter');
    await city.press('ArrowDown').catch(() => {});
    await city.press('Enter').catch(() => {});
  }
  await page.waitForTimeout(800);

  const addr = page.locator('input[autocomplete="street-address"]').first();
  await addr.click({ timeout: 5_000 });
  await addr.fill('');
  await addr.type('Тверская улица 7', { delay: 60 });
  await page.waitForTimeout(2500);
  // Pick the FIRST address suggestion using mousedown (which is what
  // DeliverySection's onMouseDown listens for). The <ul> appears as a
  // sibling of the input under the address field's wrapper; scope to
  // the visible li that doesn't contain "Москва" alone (city pick uses
  // city ul which may still be in DOM but hidden).
  await page.waitForSelector('ul li', { state: 'visible', timeout: 5_000 }).catch(() => {});
  const lis = await page.locator('ul li:visible').all();
  log('  visible LIs:', lis.length);
  if (lis.length) {
    const target = lis[0];
    log('  pick address via mousedown');
    const box = await target.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(50);
      await page.mouse.up();
    } else {
      await target.click({ timeout: 3_000 }).catch(() => {});
    }
  } else {
    await addr.press('ArrowDown').catch(() => {});
    await addr.press('Enter').catch(() => {});
  }

  await page.waitForResponse(
    (r) => r.url().includes('/delivery/calculate'),
    { timeout: 15_000 },
  ).catch(() => log('  WARN: no /delivery/calculate response'));
  await page.waitForTimeout(2000);
}

async function captureDelivery(page, label) {
  const html = await page.locator('[data-checkout-slot="delivery-method"]').first().innerHTML().catch(() => '<missing>');
  fs.writeFileSync(`${OUT}/${label}-delivery.html`, html);
  const choices = await page.$$eval(
    '[data-checkout-slot="delivery-method"] label',
    (els) => els.map((e) => e.textContent?.trim().replace(/\s+/g, ' ')),
  ).catch(() => []);
  const message = await page.$eval(
    '[data-checkout-slot="delivery-method"] p',
    (e) => e.textContent?.trim(),
  ).catch(() => null);
  return { choices, message };
}

async function runOne(target) {
  log('=== test:', target.label, target.site);
  let cartId;
  try {
    cartId = await createCart(target.shopId, target.productId);
  } catch (e) {
    log('  ERROR createCart:', e.message);
    return;
  }

  log('  launch chromium…');
  const browser = await chromium.launch({ headless: true, timeout: 30_000 });
  log('  chromium launched');
  const ctx = await browser.newContext({
    locale: 'ru-RU',
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('  pageerror:', e.message.slice(0, 200)));
  page.on('console', (m) => {
    if (m.type() === 'error') log('  console err:', m.text().slice(0, 200));
  });
  const apiCalls = [];
  page.on('response', async (r) => {
    const u = r.url();
    if (u.includes('/delivery/calculate')) {
      apiCalls.push({ status: r.status(), url: u });
      log('  net:', r.status(), u);
      try {
        const body = await r.json();
        fs.writeFileSync(`${OUT}/${target.label}-calc-response.json`, JSON.stringify(body, null, 2));
      } catch {}
    }
  });

  try {
    // Visit homepage to set localStorage cartId in same origin
    log('  goto homepage to seed origin');
    await page.goto(target.site + '/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.evaluate((id) => {
      localStorage.setItem('merfy:cartId', id);
      localStorage.setItem('merfy_cart_id', id);
    }, cartId);

    log('  goto /checkout');
    await page.goto(target.site + '/checkout', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});

    const localCartId = await page.evaluate(() => localStorage.getItem('merfy:cartId'));
    log('  localStorage cartId:', localCartId);

    await fillCheckout(page);

    const result = await captureDelivery(page, target.label);
    log('  delivery message:', result.message);
    log('  delivery choices:', JSON.stringify(result.choices));

    // viewport screenshot only — full-page hangs on these themes
    await page.screenshot({ path: `${OUT}/${target.label}-viewport.png`, fullPage: false }).catch(() => {});
    // delivery-section-scoped screenshot
    await page.locator('[data-checkout-slot="delivery-method"]').first().screenshot({ path: `${OUT}/${target.label}-delivery.png` }).catch(() => {});

    fs.writeFileSync(`${OUT}/${target.label}-summary.json`, JSON.stringify({
      site: target.site,
      cartId,
      localCartId,
      apiCalls,
      ...result,
      url: page.url(),
    }, null, 2));
  } catch (e) {
    log('  ERROR run:', e.message);
  } finally {
    await ctx.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

(async () => {
  for (const t of targets) {
    await runOne(t);
  }
  log('done. output:', OUT);
})();
