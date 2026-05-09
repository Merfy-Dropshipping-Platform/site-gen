import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
await fs.mkdir('/tmp/e2e-rose/customer-retry2', { recursive: true });

const results = {};
const SITE = 'https://dde2b0280a90.merfy.ru';
const SHOP_ID = '2b9aa824-6b7f-422e-8ac2-96b66f196513';
const PRODUCT_UUID = '97662a7f-01a7-4c6b-8465-31480a978fc2';

// =================== STEP 1 ===================
console.log('=== Step 1: Catalog ===');
await page.goto(`${SITE}/catalog`);
await page.waitForLoadState('networkidle');
try {
  await page.waitForSelector('[data-catalog-grid] article[data-product-id]', { timeout: 15000 });
} catch (e) { console.log('  hydration timeout'); }
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/00-catalog.png', fullPage: true });
const productInfo = await page.evaluate(() => {
  const card = document.querySelector('[data-catalog-grid] article[data-product-id]');
  if (!card) return null;
  return { id: card.getAttribute('data-product-id'), handle: card.getAttribute('data-product-handle') };
});
console.log('  First card:', productInfo);
results.step1_card = productInfo;

// =================== STEP 2 ===================
console.log('=== Step 2: Product page → check data-product-id ===');
const handle = productInfo?.handle ?? 'sumka-spring-10';
await page.goto(`${SITE}/product/${handle}`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);
const pAttrs = await page.$eval('section[data-block="product"]', el => ({
  productId: el.getAttribute('data-product-id'),
  productSlug: el.getAttribute('data-product-slug'),
  productHandle: el.getAttribute('data-product-handle'),
})).catch(() => null);
console.log('  Attrs:', pAttrs);
const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s||'');
results.step2_attrs = pAttrs;
results.step2_idIsUuid = isUuid(pAttrs?.productId);
console.log('  productId is UUID:', results.step2_idIsUuid);
await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/01-product.png', fullPage: true });

// =================== STEP 3 ===================
console.log('=== Step 3: Click Add to cart ===');
const addBtn = await page.$('button:has-text("Добавить в корзину")');
if (addBtn) {
  await addBtn.click();
  await page.waitForTimeout(3500);
}
const localCart1 = await page.evaluate(() => ({
  cartId: localStorage.getItem('merfy:cartId'),
  items: localStorage.getItem('merfy:cartItems'),
}));
console.log('  After click localStorage:', localCart1);
results.step3_localCartAfterClick = localCart1;
await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/02-after-add.png', fullPage: true });

// =================== STEP 3.5: Workaround — populate cart via API since UI add is broken ===================
console.log('=== Step 3.5: Populate cart via API (UUID workaround) ===');
const createResp = await fetch(`https://gateway.merfy.ru/api/orders/cart`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ shopId: SHOP_ID }),
});
const createJson = await createResp.json();
const cartId = createJson?.data?.id;
console.log('  CartId:', cartId);
if (cartId) {
  const addResp = await fetch(`https://gateway.merfy.ru/api/orders/cart/${cartId}/items`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId: PRODUCT_UUID, quantity: 1 }),
  });
  const addJson = await addResp.json();
  console.log('  Add via API:', addJson?.success ? 'OK' : 'FAIL', addJson?.message || '');
  results.step3_5_apiCartCreated = !!cartId;
  results.step3_5_apiAddSuccess = addJson?.success;
  await page.evaluate((id) => { localStorage.setItem('merfy:cartId', id); localStorage.setItem('merfy:cartItems', '[]'); }, cartId);
}

// =================== STEP 4 ===================
console.log('=== Step 4: /cart ===');
await page.goto(`${SITE}/cart`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/03-cart.png', fullPage: true });
const cartHasItem = await page.evaluate(() => !document.body.innerText.includes('пока не добавили товар'));
const cartItemsLocal = await page.evaluate(() => {
  try { return JSON.parse(localStorage.getItem('merfy:cartItems') || '[]').length; } catch { return -1; }
});
console.log('  Has item:', cartHasItem, '| local items count:', cartItemsLocal);
results.step4_cartHasItem = cartHasItem;
results.step4_cartItemsCount = cartItemsLocal;

// =================== STEP 5 ===================
console.log('=== Step 5: /checkout — fill form ===');
await page.goto(`${SITE}/checkout`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/04-checkout-empty.png', fullPage: true });

const fillField = async (selector, value, label) => {
  try {
    await page.fill(selector, value, { timeout: 5000 });
    console.log(`  ${label}: OK`);
    return true;
  } catch (e) {
    console.log(`  ${label}: FAIL (${selector})`);
    return false;
  }
};

await fillField('input#email', 'customer1@test.com', 'email');
await fillField('input#phone', '79991234567', 'phone');
await fillField('input[autocomplete="given-name"]', 'Иван', 'firstName');
await fillField('input[autocomplete="family-name"]', 'Тестов', 'lastName');

// City (DaData autocomplete)
console.log('  filling city...');
const cityFilled = await fillField('input[autocomplete="address-level2"]', 'Москва', 'city');
await page.waitForTimeout(2500);
const citySugg = await page.$('.dadata-suggestion, [class*="suggestion"]:not(input):not(button), [role="option"], li[data-value]');
if (citySugg) {
  await citySugg.click();
  console.log('  city suggestion clicked');
  await page.waitForTimeout(1500);
}

// Address (DaData autocomplete)
console.log('  filling address...');
const streetFilled = await fillField('input[autocomplete="address-line1"]', 'Тверская', 'street');
await page.waitForTimeout(2500);
const streetSugg = await page.$('.dadata-suggestion, [class*="suggestion"]:not(input):not(button), [role="option"]');
if (streetSugg) {
  await streetSugg.click();
  console.log('  street suggestion clicked');
  await page.waitForTimeout(1500);
}

await fillField('input[autocomplete="address-line2"]', '10', 'house');
await fillField('input[autocomplete="postal-code"]', '125009', 'postal-code');

await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/05-filled.png', fullPage: true });

// =================== STEP 6 ===================
console.log('=== Step 6: Wait for delivery options ===');
await page.waitForTimeout(6000);
await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/06-delivery-options.png', fullPage: true });

const deliveryOptions = await page.evaluate(() => {
  // Look for any element that looks like delivery option
  const candidates = Array.from(document.querySelectorAll('[data-delivery-method], [data-delivery-type], [class*="delivery-method"], section, article, label'));
  return candidates
    .filter(el => /сдэк|cdek|самовывоз|почта|курьер|доставка/i.test(el.innerText || ''))
    .map(el => ({ tag: el.tagName, text: el.innerText?.slice(0, 200), class: el.className?.slice(0, 60) }))
    .slice(0, 10);
});
console.log('  Delivery candidates:', JSON.stringify(deliveryOptions, null, 2).slice(0, 1200));
results.step6_deliveryCandidates = deliveryOptions;

// Check if standard delivery method radios appear
const deliveryRadios = await page.evaluate(() => {
  const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
  return radios.filter(r => r.name !== 'payment-method').map(r => ({
    name: r.name, value: r.value,
    label: r.closest('label')?.innerText?.trim().slice(0, 100),
  }));
});
console.log('  Delivery radios:', deliveryRadios);
results.step6_deliveryRadios = deliveryRadios;

// =================== STEP 7 ===================
console.log('=== Step 7: ROSE10 promo ===');
const promoInput = await page.$('input[placeholder*="промокод" i]');
if (promoInput) {
  await promoInput.fill('ROSE10');
  const applyBtn = await page.$('button:has-text("Применить")');
  if (applyBtn) {
    await applyBtn.click();
    await page.waitForTimeout(3500);
    console.log('  Applied');
    results.step7_promoApplied = true;
  }
}
await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/07-promo.png', fullPage: true });

const totalsAfter = await page.evaluate(() => {
  const lines = document.body.innerText.split('\n').filter(Boolean);
  return lines.filter(l => /итого|скид|промок|оплатить|\d.*₽/i.test(l)).slice(0, 25);
});
console.log('  Totals after promo:', JSON.stringify(totalsAfter, null, 2));
results.step7_totalsAfter = totalsAfter;

// =================== STEP 8 ===================
console.log('=== Step 8: Submit ===');
const submitBtn = await page.$('button:has-text("Оплатить")');
if (submitBtn) {
  const text = await submitBtn.innerText();
  const disabled = await submitBtn.isDisabled();
  console.log(`  Submit: "${text}" disabled=${disabled}`);
  results.step8_submitText = text;
  results.step8_submitDisabled = disabled;
  if (!disabled) {
    await submitBtn.click();
    await page.waitForTimeout(8000);
    results.step8_url = page.url();
    console.log('  URL after:', page.url());
    await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/08-submitted.png', fullPage: true });
  }
}

await fs.writeFile('/tmp/e2e-rose/customer-retry2/results.json', JSON.stringify(results, null, 2));
console.log('=== DONE ===');
console.log(JSON.stringify(results, null, 2));

await browser.close();
