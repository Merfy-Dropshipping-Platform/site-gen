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

// Capture network calls
const apiCalls = [];
page.on('response', async (res) => {
  const u = res.url();
  if (/gateway\.merfy\.ru\/api\/(orders|delivery)/.test(u)) {
    apiCalls.push({ method: res.request().method(), url: u, status: res.status() });
  }
});

// =================== STEP 1 ===================
console.log('=== Step 1: Catalog ===');
await page.goto(`${SITE}/catalog`);
await page.waitForLoadState('networkidle');
try { await page.waitForSelector('[data-catalog-grid] article[data-product-id]', { timeout: 15000 }); } catch {}
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/00-catalog.png', fullPage: true });
const catalogCard = await page.evaluate(() => {
  const c = document.querySelector('[data-catalog-grid] article[data-product-id]');
  return c ? { id: c.getAttribute('data-product-id'), handle: c.getAttribute('data-product-handle') } : null;
});
console.log('  Card:', catalogCard);
results.step1 = catalogCard;

// =================== STEP 2 ===================
console.log('=== Step 2: Product page ===');
const handle = catalogCard?.handle ?? 'sumka-spring-10';
await page.goto(`${SITE}/product/${handle}`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);
const pAttrs = await page.$eval('section[data-block="product"]', el => ({
  productId: el.getAttribute('data-product-id'),
  productSlug: el.getAttribute('data-product-slug'),
  productHandle: el.getAttribute('data-product-handle'),
})).catch(() => null);
const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s||'');
results.step2_attrs = pAttrs;
results.step2_idIsUuid = isUuid(pAttrs?.productId);
console.log('  Attrs:', pAttrs, '| isUuid:', results.step2_idIsUuid);
await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/01-product.png', fullPage: true });

// =================== STEP 3 ===================
console.log('=== Step 3: UI Add to cart ===');
const addBtn = await page.$('button:has-text("Добавить в корзину")');
if (addBtn) { await addBtn.click(); await page.waitForTimeout(3500); }
const localCart1 = await page.evaluate(() => ({
  cartId: localStorage.getItem('merfy:cartId'),
  items: JSON.parse(localStorage.getItem('merfy:cartItems') || '[]').length,
}));
results.step3_uiAddResult = localCart1;
console.log('  After UI click:', localCart1);
await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/02-after-add.png', fullPage: true });

// =================== STEP 3.5: API workaround ===================
console.log('=== Step 3.5: API workaround (UUID) ===');
const createResp = await fetch(`https://gateway.merfy.ru/api/orders/cart`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ shopId: SHOP_ID }),
});
const createJson = await createResp.json();
const cartId = createJson?.data?.id;
console.log('  CartId:', cartId);
const addResp = await fetch(`https://gateway.merfy.ru/api/orders/cart/${cartId}/items`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ productId: PRODUCT_UUID, quantity: 1 }),
});
const addJson = await addResp.json();
results.step3_5_apiSuccess = addJson?.success;
console.log('  API add:', addJson?.success ? 'OK' : 'FAIL');
await page.evaluate((id) => { localStorage.setItem('merfy:cartId', id); }, cartId);

// =================== STEP 4 ===================
console.log('=== Step 4: /cart ===');
await page.goto(`${SITE}/cart`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/03-cart.png', fullPage: true });
const cartHasItem = await page.evaluate(() => !document.body.innerText.includes('пока не добавили товар'));
const cartItems = await page.evaluate(() => {
  try { return JSON.parse(localStorage.getItem('merfy:cartItems') || '[]').length; } catch { return -1; }
});
console.log('  Has item:', cartHasItem, '| count:', cartItems);
results.step4 = { hasItem: cartHasItem, count: cartItems };

// =================== STEP 5 ===================
console.log('=== Step 5: /checkout ===');
await page.goto(`${SITE}/checkout`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3500);
await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/04-checkout-empty.png', fullPage: true });

const fillField = async (selector, value, label) => {
  try { await page.fill(selector, value, { timeout: 5000 }); console.log(`  ${label}: OK`); return true; }
  catch { console.log(`  ${label}: FAIL`); return false; }
};

await fillField('input#email', 'customer1@test.com', 'email');
await fillField('input#phone', '79991234567', 'phone');
await fillField('input[autocomplete="given-name"]', 'Иван', 'firstName');
await fillField('input[autocomplete="family-name"]', 'Тестов', 'lastName');

// City: type then click first <li> in nearest <ul>
console.log('  filling city...');
await page.fill('input[autocomplete="address-level2"]', 'Москв');
await page.waitForTimeout(2500);
const cityLi = await page.$('input[autocomplete="address-level2"] ~ ul li, ul li:has-text("Москва")');
if (cityLi) { await cityLi.click(); console.log('  city sugg clicked'); await page.waitForTimeout(1500); }
else { console.log('  city sugg not found, falling back to direct'); await page.fill('input[autocomplete="address-level2"]', 'Москва'); }

console.log('  filling street...');
await page.fill('input[autocomplete="address-line1"]', 'Тверска');
await page.waitForTimeout(2500);
const streetLi = await page.$('input[autocomplete="address-line1"] ~ ul li');
if (streetLi) { await streetLi.click(); console.log('  street sugg clicked'); await page.waitForTimeout(1500); }
else {
  // Try finding by visible
  const streetLi2 = await page.evaluateHandle(() => {
    const lists = Array.from(document.querySelectorAll('ul'));
    for (const ul of lists) {
      const li = ul.querySelector('li');
      if (li && /тверская/i.test(li.innerText)) return li;
    }
    return null;
  });
  if (streetLi2 && await streetLi2.evaluate(e => !!e)) {
    await streetLi2.click();
    console.log('  street sugg via search');
    await page.waitForTimeout(1500);
  }
}

await fillField('input[autocomplete="address-line2"]', '10', 'house');
await fillField('input[autocomplete="postal-code"]', '125009', 'postal-code');

await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/05-filled.png', fullPage: true });

// =================== STEP 6 ===================
console.log('=== Step 6: Wait for delivery options (8s) ===');
await page.waitForTimeout(8000);
await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/06-delivery-options.png', fullPage: true });

const deliveryArea = await page.evaluate(() => {
  // Find the "Способ доставки" h2 and grab its parent's content
  const heading = Array.from(document.querySelectorAll('h2')).find(h => /Способ доставки/i.test(h.innerText));
  if (!heading) return null;
  const section = heading.closest('section, div');
  return {
    hasMethods: !!section?.querySelector('input[type="radio"]:not([name="payment-method"])'),
    text: section?.innerText?.slice(0, 500),
  };
});
console.log('  Delivery section:', deliveryArea);
results.step6 = deliveryArea;

const deliveryRadios = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('input[type="radio"]'))
    .filter(r => r.name !== 'payment-method')
    .map(r => ({ name: r.name, value: r.value, label: r.closest('label')?.innerText?.slice(0, 100) }));
});
console.log('  Delivery radios:', deliveryRadios);
results.step6_radios = deliveryRadios;

// =================== STEP 7 ===================
console.log('=== Step 7: ROSE10 promo ===');
const promoInput = await page.$('input[placeholder*="промокод" i]');
if (promoInput) {
  await promoInput.fill('ROSE10');
  const applyBtn = await page.$('button:has-text("Применить")');
  if (applyBtn) {
    await applyBtn.click();
    await page.waitForTimeout(4000);
    console.log('  Promo applied');
  }
}
await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/07-promo.png', fullPage: true });

const finalTotals = await page.evaluate(() => {
  const text = document.body.innerText;
  return text.split('\n').filter(l => /итого|скид|промок|оплатить|499|449/i.test(l)).slice(0, 25);
});
console.log('  Totals:', JSON.stringify(finalTotals, null, 2));
results.step7_totals = finalTotals;

// =================== STEP 8 ===================
console.log('=== Step 8: Submit ===');
const submitBtn = await page.$('button:has-text("Оплатить")');
if (submitBtn) {
  const text = await submitBtn.innerText();
  const disabled = await submitBtn.isDisabled();
  console.log(`  Submit: "${text}" disabled=${disabled}`);
  results.step8 = { text, disabled };
  if (!disabled) {
    await submitBtn.click();
    await page.waitForTimeout(8000);
    results.step8_url = page.url();
    console.log('  URL after:', page.url());
    await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/08-submitted.png', fullPage: true });
  }
}

results.apiCallsCount = apiCalls.length;
results.deliveryApiCalls = apiCalls.filter(c => /delivery|profile/i.test(c.url));

await fs.writeFile('/tmp/e2e-rose/customer-retry2/results.json', JSON.stringify(results, null, 2));
console.log('=== DONE ===');
console.log('Results:', JSON.stringify(results, null, 2));
console.log('--- All API calls ---');
apiCalls.forEach(c => console.log(`  [${c.status}] ${c.method} ${c.url}`));

await browser.close();
