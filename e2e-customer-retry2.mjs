import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
await fs.mkdir('/tmp/e2e-rose/customer-retry2', { recursive: true });

const results = {};

console.log('=== Step 1: Catalog → first product ===');
await page.goto('https://dde2b0280a90.merfy.ru/catalog');
await page.waitForLoadState('networkidle');
// Wait for client-side hydration: cards with data-product-id should appear
try {
  await page.waitForSelector('[data-catalog-grid] article[data-product-id]', { timeout: 15000 });
} catch (e) {
  console.log('  Catalog hydration timeout:', e.message);
}
await page.waitForTimeout(1500);

await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/00-catalog.png', fullPage: true });

// Look for hydrated product card with handle attribute
const productInfo = await page.evaluate(() => {
  const card = document.querySelector('[data-catalog-grid] article[data-product-id]');
  if (!card) return null;
  return {
    id: card.getAttribute('data-product-id'),
    handle: card.getAttribute('data-product-handle'),
  };
});
console.log('Product card:', productInfo);
results.step1_productInfo = productInfo;

let productHref = null;
if (productInfo?.handle) {
  productHref = `/product/${productInfo.handle}`;
} else {
  productHref = await page.$eval('a[href^="/product/"]', el => el.getAttribute('href')).catch(() => null);
}
console.log('Product href:', productHref);
results.step1_productHref = productHref;

if (!productHref) {
  console.log('ERROR: No product href found on catalog');
  await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/catalog-error.png', fullPage: true });
  await browser.close();
  process.exit(1);
}

await page.goto(`https://dde2b0280a90.merfy.ru${productHref}`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2500);

console.log('=== Step 2: Verify data-product-id is UUID ===');
const productAttrs = await page.$eval('section[data-block="product"]', el => ({
  productId: el.getAttribute('data-product-id'),
  productSlug: el.getAttribute('data-product-slug'),
  productHandle: el.getAttribute('data-product-handle'),
})).catch(() => null);
console.log('Product attrs:', productAttrs);

const isUuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const productIdIsUuid = isUuid(productAttrs?.productId);
console.log('  productId is UUID:', productIdIsUuid);
results.step2_productAttrs = productAttrs;
results.step2_productIdIsUuid = productIdIsUuid;

await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/01-product.png', fullPage: true });

console.log('=== Step 3: Add to cart ===');
const addBtn = await page.$('button:has-text("Добавить в корзину")');
let addClicked = false;
if (addBtn) {
  await addBtn.click();
  await page.waitForTimeout(3000);
  console.log('  Add clicked');
  addClicked = true;
}
results.step3_addClicked = addClicked;
await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/02-after-add.png', fullPage: true });

const cartLocal = await page.evaluate(() => localStorage.getItem('merfy:cartItems'));
console.log('  localStorage cart:', cartLocal);
results.step3_cartLocal = cartLocal;

console.log('=== Step 4: Visit /cart ===');
await page.goto('https://dde2b0280a90.merfy.ru/cart');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/03-cart.png', fullPage: true });

const cartHasItem = await page.evaluate(() => {
  const text = document.body.innerText;
  return !text.includes('пока не добавили товар');
});
console.log('  Cart has items:', cartHasItem);
results.step4_cartHasItem = cartHasItem;

console.log('=== Step 5: /checkout — fill form ===');
await page.goto('https://dde2b0280a90.merfy.ru/checkout');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/04-checkout-empty.png', fullPage: true });

try { await page.fill('input#checkout-email, input[name="email"]', 'customer1@test.com'); } catch (e) { console.log('  email fill:', e.message); }
try { await page.fill('input#checkout-phone, input[name="phone"]', '79991234567'); } catch (e) { console.log('  phone fill:', e.message); }
const fn = await page.$('input[name="firstName"]');
if (fn) await fn.fill('Иван');
const ln = await page.$('input[name="lastName"]');
if (ln) await ln.fill('Тестов');

// City (DaData)
const cityInput = await page.$('input[name="city"]');
if (cityInput) {
  await cityInput.fill('Москва');
  await page.waitForTimeout(2000);
  const cityFirst = await page.$('.dadata-suggestion:first-of-type, [data-suggestion]:first-of-type, [role="option"]:first-of-type, li[data-value]:first-of-type');
  if (cityFirst) await cityFirst.click();
  await page.waitForTimeout(1500);
}

// Address (DaData)
const addrField = await page.$('input[name="address"], input[name="street"]');
if (addrField) {
  await addrField.fill('Тверская 10');
  await page.waitForTimeout(2000);
  const addrSugg = await page.$('.dadata-suggestion:first-of-type, [data-suggestion]:first-of-type, [role="option"]:first-of-type, li[data-value]:first-of-type');
  if (addrSugg) await addrSugg.click();
}
await page.waitForTimeout(1500);

const houseField = await page.$('input[name="building"], input[name="house"]');
if (houseField) await houseField.fill('15');
const indexField = await page.$('input[name="postalCode"]');
if (indexField) await indexField.fill('123100');

await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/05-filled.png', fullPage: true });

console.log('=== Step 6: Wait + check delivery options ===');
await page.waitForTimeout(5000);
await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/06-delivery-options.png', fullPage: true });

const deliveryOptions = await page.evaluate(() => {
  const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
  return radios.map(r => ({ name: r.name, value: r.value, label: r.closest('label')?.innerText?.trim().slice(0, 80) }));
});
console.log('  Radios:', JSON.stringify(deliveryOptions, null, 2));
results.step6_deliveryOptions = deliveryOptions;

const cdek = await page.$('input[value="cdek"], label:has-text("СДЭК") input, label:has-text("Курьер") input');
if (cdek) {
  await cdek.click();
  await page.waitForTimeout(2000);
  console.log('  CDEK selected');
  results.step6_cdekSelected = true;
}

console.log('=== Step 7: Apply ROSE10 promo ===');
const promoToggle = await page.$('a:has-text("У меня есть промокод"), button:has-text("промокод")');
if (promoToggle) {
  await promoToggle.click();
  await page.waitForTimeout(500);
}

const promoInput = await page.$('input[name="promoCode"], input[placeholder*="промокод" i]');
if (promoInput) {
  await promoInput.fill('ROSE10');
  const applyBtn = await page.$('button:has-text("Применить")');
  if (applyBtn) await applyBtn.click();
  await page.waitForTimeout(3000);
  results.step7_promoApplied = true;
}
await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/07-promo.png', fullPage: true });

const submitBtn = await page.$('button:has-text("Оплатить"), button[data-checkout-submit]');
if (submitBtn) {
  const text = await submitBtn.innerText();
  const disabled = await submitBtn.isDisabled();
  console.log('  Submit:', text, 'disabled:', disabled);
  results.step7_submitText = text;
  results.step7_submitDisabled = disabled;
}

// Capture totals
const totals = await page.evaluate(() => {
  const text = document.body.innerText;
  const lines = text.split('\n');
  const interesting = lines.filter(l => /итого|сумм|скид|доставк|товар/i.test(l)).slice(0, 20);
  return interesting;
});
console.log('  Totals extracted:', totals);
results.step7_totals = totals;

console.log('=== Step 8: Submit ===');
let submitUrl = null;
if (submitBtn) {
  const disabled = await submitBtn.isDisabled();
  if (!disabled) {
    await submitBtn.click();
    await page.waitForTimeout(8000);
    submitUrl = page.url();
    console.log('  URL after submit:', submitUrl);
    await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/08-submitted.png', fullPage: true });
  } else {
    console.log('  Submit disabled, skipping');
  }
}
results.step8_submitUrl = submitUrl;

await fs.writeFile('/tmp/e2e-rose/customer-retry2/results.json', JSON.stringify(results, null, 2));
console.log('=== DONE ===');
console.log(JSON.stringify(results, null, 2));

await browser.close();
