// Screenshot suite: capture all delivery variants on rebuilt 9c1c6fa8be34
// Variants:
//   1) initial — empty (no city, hint "Введите адрес")
//   2) all-three — CDEK + pickup + custom (Moscow, Тверская)
//   3) cdek-only — CDEK + pickup (no custom — using bfe4f2ec/cc3c46622b51)
//   4) custom-only — custom profile (using ded99918/4692bbed7524)
import { chromium } from 'playwright';
import fs from 'fs';

const OUT = '/tmp/checkout-screens';
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log('[shot]', ...a);
const API = 'https://gateway.merfy.ru/api';

const variants = [
  {
    label: '1-initial',
    site: 'https://9c1c6fa8be34.merfy.ru',
    shopId: '71f9b323-de3c-4f74-9e08-85c274493735',
    productId: 'eb66872b-50ae-4d6e-b938-198c157e30a7',
    fillAddress: false,
  },
  {
    label: '2-all-three',
    site: 'https://9c1c6fa8be34.merfy.ru',
    shopId: '71f9b323-de3c-4f74-9e08-85c274493735',
    productId: 'eb66872b-50ae-4d6e-b938-198c157e30a7',
    fillAddress: true,
    address: 'Тверская улица 7',
    expects: ['CDEK', 'Самовывоз', 'Стандарт'],
  },
  {
    label: '3-cdek-pickup',
    site: 'https://cc3c46622b51.merfy.ru',
    shopId: 'bfe4f2ec-a240-492b-82ac-851821b888f7',
    productId: '18f5cf30-b5cc-4021-9ac1-a4dd5e635ee2',
    fillAddress: true,
    address: 'Тверская улица 7',
  },
  {
    label: '4-custom-only',
    site: 'https://4692bbed7524.merfy.ru',
    shopId: 'ded99918-b38b-4e94-af06-1ba69b64b292',
    productId: '28bc49de-f33f-474b-aa20-ef99a1abac99',
    fillAddress: true,
    address: 'Тверская улица 7',
  },
];

async function setup(page, site, cartId) {
  await page.goto(site + '/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.evaluate((id) => {
    localStorage.setItem('merfy:cartId', id);
    localStorage.setItem('merfy_cart_id', id);
  }, cartId);
  await page.goto(site + '/checkout', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('[data-checkout-slot="contact"]', { timeout: 15_000 });
  await page.waitForTimeout(2500);
}

async function fillBasics(page) {
  const f = (sel, val) => page.locator(sel).first().fill(val).catch(() => {});
  await f('input#email', 'test+e2e@merfy.test');
  await f('input#phone', '+79991234567');
  await f('input[autocomplete="given-name"]', 'Иван');
  await f('input[autocomplete="family-name"]', 'Иванов');
}

async function pickCity(page) {
  const city = page.locator('input[autocomplete="address-level2"]').first();
  if (!(await city.count())) {
    log('  no city input — site may not have one');
    return;
  }
  await city.click();
  await city.fill('');
  await city.type('Москва', { delay: 60 });
  await page.waitForTimeout(1500);
  await page.waitForSelector('ul li:visible', { timeout: 5_000 }).catch(() => {});
  const li = page.locator('ul li:visible').filter({ hasText: 'Москва' }).first();
  if (await li.count()) {
    const box = await li.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(50);
      await page.mouse.up();
    }
    log('  city picked');
  }
  await page.waitForTimeout(800);
}

async function pickAddress(page, addrText) {
  const addr = page.locator('input[autocomplete="street-address"]').first();
  await addr.click();
  await addr.fill('');
  await addr.type(addrText, { delay: 60 });
  await page.waitForTimeout(2200);
  await page.waitForSelector('ul li:visible', { timeout: 5_000 }).catch(() => {});
  const lis = await page.locator('ul li:visible').all();
  if (lis.length) {
    const box = await lis[0].boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(50);
      await page.mouse.up();
      log(`  address picked (${lis.length} options)`);
    }
  } else {
    log('  no address suggestion list');
  }
}

async function captureDelivery(page, label) {
  const section = page.locator('[data-checkout-slot="delivery-method"]').first();
  await section.scrollIntoViewIfNeeded().catch(() => {});

  const html = await section.innerHTML().catch(() => '<missing>');
  fs.writeFileSync(`${OUT}/${label}-delivery.html`, html);

  const choices = await page.$$eval(
    '[data-checkout-slot="delivery-method"] label',
    (els) => els.map((e) => e.textContent?.trim().replace(/\s+/g, ' ')),
  ).catch(() => []);
  const message = await page.$eval(
    '[data-checkout-slot="delivery-method"] p',
    (e) => e.textContent?.trim(),
  ).catch(() => null);

  await page.screenshot({ path: `${OUT}/${label}-viewport.png`, fullPage: false }).catch(() => {});
  await section.screenshot({ path: `${OUT}/${label}-delivery.png` }).catch(() => {});

  return { choices, message };
}

async function runOne(v) {
  log('=== variant:', v.label, '@', v.site);

  // Create cart
  const r1 = await fetch(`${API}/store/carts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store_id: v.shopId }),
  });
  const { cart } = await r1.json();
  const cartId = cart.id;
  log('  cartId', cartId);

  // Add item
  await fetch(`${API}/store/carts/${cartId}/items`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: v.productId, quantity: 1 }),
  });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    locale: 'ru-RU', viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('  pageerror:', e.message.slice(0, 200)));

  let calcResp = null;
  page.on('response', async (r) => {
    if (r.url().includes('/delivery/calculate')) {
      try { calcResp = await r.json(); } catch {}
    }
  });

  try {
    await setup(page, v.site, cartId);
    await fillBasics(page);
    if (v.fillAddress) {
      await pickCity(page);
      await pickAddress(page, v.address);
      // wait for calculate response
      await page.waitForResponse(
        (r) => r.url().includes('/delivery/calculate'),
        { timeout: 12_000 },
      ).catch(() => log('  WARN: no /delivery/calculate'));
      await page.waitForTimeout(1500);
    }

    const result = await captureDelivery(page, v.label);
    log('  message:', result.message ?? '(none)');
    log('  choices:', JSON.stringify(result.choices));
    if (calcResp) log('  api categories:',
      'tariffs=' + (calcResp.data?.tariffs?.length ?? 0),
      'pickup=' + (calcResp.data?.pickupAvailable ?? false),
      'custom=' + (calcResp.data?.customProfiles?.length ?? 0),
    );

    fs.writeFileSync(`${OUT}/${v.label}-summary.json`, JSON.stringify({
      site: v.site, shopId: v.shopId, cartId, ...result, apiResponse: calcResp,
    }, null, 2));
  } catch (e) {
    log('  ERROR:', e.message);
  } finally {
    await ctx.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

(async () => {
  for (const v of variants) {
    await runOne(v);
  }
  log('done. output:', OUT);
})();
