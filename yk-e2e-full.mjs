/**
 * Полный E2E прогон чекаута на тест-шопе с YooKassa Tokenization SDK widget.
 *
 * Сайт:  https://cd1136c1724e.merfy.ru
 * Shop:  78ea7210-f2d4-4b44-a55b-74183f387b27
 * Test product: 5a4afd20-48ec-4ddd-80b4-a0af3cfec81d (1₽)
 *
 * Маршрут:
 *  Homepage → Catalog → Product → Cart → Checkout
 *  Заполняем все поля → выбираем Самовывоз → банк карта
 *  Тестовая карта (test mode YooKassa) или фиктивная — не сабмитим в live.
 *  Скриншоты на каждом шаге в /tmp/yk-e2e/.
 */
import { chromium } from 'playwright';
import fs from 'fs';

const OUT = '/tmp/yk-e2e';
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) fs.unlinkSync(`${OUT}/${f}`);

const SITE = 'https://cd1136c1724e.merfy.ru';
const SHOP_ID = '78ea7210-f2d4-4b44-a55b-74183f387b27';
const TEST_PRODUCT_ID = '5a4afd20-48ec-4ddd-80b4-a0af3cfec81d';
// Москва FIAS (известный): нужно для useCdek чтобы вернул pickup choice
const MOSCOW_FIAS = '0c5b2444-70a0-4932-980c-b4dc0d3f02b5';

const log = (...a) => {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${a.join(' ')}`;
  console.log(line);
  fs.appendFileSync(`${OUT}/run.log`, line + '\n');
};

let stepCounter = 0;
async function snap(page, label) {
  stepCounter++;
  const n = String(stepCounter).padStart(2, '0');
  const file = `${OUT}/${n}-${label.replace(/[^\w-]/g, '_')}.png`;
  await page.screenshot({ path: file, fullPage: true }).catch((e) => log('snapshot fail:', e.message));
  log(`📸 ${file}`);
}

async function preCreateCart() {
  log('=== pre-create cart ===');
  const r1 = await fetch(`https://gateway.merfy.ru/api/store/carts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store_id: SHOP_ID }),
  });
  const c = await r1.json();
  const cartId = c?.cart?.id;
  if (!cartId) throw new Error('no cart id: ' + JSON.stringify(c));

  const r2 = await fetch(`https://gateway.merfy.ru/api/store/carts/${cartId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: TEST_PRODUCT_ID, quantity: 1 }),
  });
  await r2.json();
  log('cartId:', cartId);
  return cartId;
}

(async () => {
  log('start E2E');
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ru-RU' });
  const page = await ctx.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') log('console.err:', msg.text().slice(0, 250));
  });
  page.on('pageerror', (err) => log('pageerror:', err.message));

  const cartId = await preCreateCart();

  try {
    // 1. Homepage
    log('=== 1. Homepage ===');
    await page.goto(SITE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await snap(page, 'home');

    // 2. Catalog
    log('=== 2. Catalog ===');
    await page.goto(SITE + '/catalog', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await snap(page, 'catalog');

    // 3. Open cheap product
    log('=== 3. Product page ===');
    await page.goto(SITE + '/product/testovyj-tovar-1', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await snap(page, 'product');

    // Pre-injected cart — page.evaluate to set localStorage before /cart load
    await page.evaluate((id) => localStorage.setItem('merfy:cartId', id), cartId);

    // 4. Cart
    log('=== 4. Cart ===');
    await page.goto(SITE + '/cart', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await snap(page, 'cart');

    // 5. Checkout — let it hydrate fully (YooKassa SDK + payment-config fetch)
    log('=== 5. Checkout (initial) ===');
    await page.goto(SITE + '/checkout', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(4000);
    await snap(page, 'checkout-initial');

    // 6. Fill contact
    log('=== 6. Fill contact ===');
    await page.fill('input[type="email"]', 'test@merfy.ru');
    await page.fill('input[type="tel"]', '+79001234567');
    await page.fill('input[autocomplete="given-name"]', 'Тест');
    await page.fill('input[autocomplete="family-name"]', 'Тестов');
    await snap(page, 'contact-filled');

    // 7. Fill structured address — type city slowly, wait for DaData popup,
    //    click first suggestion (so cityFiasId fills → useCdek can fetch).
    log('=== 7. Fill address ===');
    const cityInput = await page.$('input[autocomplete="address-level2"]');
    await cityInput.click();
    // Use type() to trigger debounced DaData call (300ms in hook).
    await cityInput.type('Москва', { delay: 50 });
    // Wait up to 5 sec for DaData dropdown.
    let suggestionPicked = false;
    try {
      await page.waitForSelector('ul li:has-text("Москва")', { timeout: 5000 });
      const items = await page.$$('ul li');
      log(`DaData city suggestions: ${items.length}`);
      if (items.length > 0) {
        // First item is usually "г Москва"
        await items[0].click();
        suggestionPicked = true;
        log('picked city suggestion');
      }
    } catch {
      log('DaData city dropdown timed out — typing manually');
    }
    await snap(page, 'after-city-pick');

    // Улица
    const streetInput = await page.$('input[autocomplete="address-line1"]');
    await streetInput.click();
    await streetInput.type('Тверская', { delay: 50 });
    try {
      await page.waitForSelector('ul li:has-text("Тверская")', { timeout: 5000 });
      const items = await page.$$('ul li');
      log(`DaData street suggestions: ${items.length}`);
      if (items.length > 0) {
        await items[0].click();
        log('picked street suggestion');
      }
    } catch {
      log('DaData street dropdown timed out');
    }

    // Дом + Кв если ещё не заполнены
    const buildingVal = await page.$eval('input[autocomplete="address-line2"]', (el) => el.value);
    if (!buildingVal) await page.fill('input[autocomplete="address-line2"]', '1');
    await page.fill('input[autocomplete="address-line3"]', '5');
    const indexVal = await page.$eval('input[autocomplete="postal-code"]', (el) => el.value);
    if (!indexVal) await page.fill('input[autocomplete="postal-code"]', '125009');

    await snap(page, 'address-filled');

    // useCdek is debounced + needs cityFiasId from DaData pick.
    log('waiting for delivery options (useCdek fetch)…');
    await page.waitForTimeout(3500);
    await snap(page, 'after-address');

    // 8. Select delivery method
    log('=== 8. Pick delivery method ===');
    const dmCount = await page.$$eval('input[name="delivery-method"]', (el) => el.length);
    log(`delivery-method radios on page: ${dmCount}`);
    if (dmCount > 0) {
      // click первый radio через label (sr-only input, нужен parent label)
      const dmLabels = await page.$$('label:has(input[name="delivery-method"])');
      log(`delivery method labels: ${dmLabels.length}`);
      if (dmLabels[0]) {
        await dmLabels[0].click();
        log('clicked first delivery method');
      }
    } else {
      log('❌ no delivery method radios — useCdek likely returned empty');
    }
    await page.waitForTimeout(500);
    await snap(page, 'delivery-method-selected');

    // 9. Select bank card
    log('=== 9. Select bank_card ===');
    const bankCard = await page.$('label:has-text("Банковская карта")');
    if (bankCard) await bankCard.click();
    await page.waitForTimeout(2500);
    await snap(page, 'payment-bank-card');

    // 10. Fill card with formatters (типичная test-карта YooKassa)
    log('=== 10. Fill card ===');
    // Test cards from YooKassa docs: 5555 5555 5555 4477, 12/30, CVC 123
    await page.fill('input[autocomplete="cc-number"]', '5555555555554477');
    await page.fill('input[autocomplete="cc-exp"]', '1230');
    await page.fill('input[autocomplete="cc-csc"]', '123');
    await page.fill('input[autocomplete="cc-name"]', 'Test Test');
    await page.waitForTimeout(500);
    await snap(page, 'card-filled');

    // 11. Verify YooKassa SDK
    log('=== 11. SDK + state check ===');
    const diag = await page.evaluate(() => ({
      sdkLoaded: typeof window.YooMoneyCheckout !== 'undefined',
      cardNumberValue: document.querySelector('input[autocomplete="cc-number"]')?.value,
      cardExpiryValue: document.querySelector('input[autocomplete="cc-exp"]')?.value,
      cardCvcValue: document.querySelector('input[autocomplete="cc-csc"]')?.value,
      cardNameValue: document.querySelector('input[autocomplete="cc-name"]')?.value,
    }));
    log('sdk loaded:', diag.sdkLoaded);
    log('card number formatted:', JSON.stringify(diag.cardNumberValue));
    log('card expiry formatted:', JSON.stringify(diag.cardExpiryValue));
    log('card cvc:', JSON.stringify(diag.cardCvcValue));
    log('card name:', JSON.stringify(diag.cardNameValue));

    // Check submit button state
    const submitDisabled = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const oplata = buttons.find((b) => /оплат/i.test(b.textContent ?? ''));
      return oplata ? { text: oplata.textContent?.trim(), disabled: oplata.disabled } : null;
    });
    log('Submit button:', JSON.stringify(submitDisabled));
    await snap(page, 'final-state');

    log('=== STOP — не нажимаем "Оплатить" в headless с реальной картой ===');
  } catch (e) {
    log('💥', e.message);
    log(e.stack);
    await snap(page, 'CRASH');
  } finally {
    await browser.close();
  }
  log('done');
})();
