import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
await fs.mkdir('/tmp/e2e-rose/final', { recursive: true });

// Capture console logs
page.on('console', msg => {
  const t = msg.type();
  if (t === 'error' || t === 'warning') {
    console.log(`  [browser ${t}]:`, msg.text().slice(0, 300));
  }
});
page.on('pageerror', err => console.log('  [pageerror]:', err.message.slice(0, 300)));
page.on('requestfailed', req => {
  const url = req.url();
  if (!url.includes('favicon') && !url.includes('googletag')) {
    console.log('  [reqfail]:', url, '-', req.failure()?.errorText?.slice(0, 100));
  }
});

const log = (msg, ...args) => console.log(msg, ...args);

log('=== 1. Visit catalog (verify renders) ===');
await page.goto('https://dde2b0280a90.merfy.ru/catalog');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(5000); // Give JS time to fetch storefront-data and rerender
const productHrefAfterJs = await page.$eval('a[href^="/product/"]', el => el.getAttribute('href')).catch(() => null);
log('  product href after JS:', productHrefAfterJs);
await page.screenshot({ path: '/tmp/e2e-rose/final/00-catalog.png', fullPage: true });

// Use a known product from the storefront API (SPRING-10)
const knownProductSlug = 'sumka-spring-10';
log(`=== 2. Visit /product/${knownProductSlug} ===`);
await page.goto(`https://dde2b0280a90.merfy.ru/product/${knownProductSlug}`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2500);

const attrs = await page.$eval('section[data-block="product"]', el => ({
  productId: el.getAttribute('data-product-id'),
  productSlug: el.getAttribute('data-product-slug'),
  productHandle: el.getAttribute('data-product-handle'),
})).catch(() => null);
log('  product attrs:', attrs);
const isUuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
log('  is UUID:', isUuid(attrs?.productId));

await page.screenshot({ path: '/tmp/e2e-rose/final/01-product.png', fullPage: true });

log('=== 3. Click "Добавить в корзину" ===');
const addBtn = await page.$('button:has-text("Добавить в корзину")');
log('  addBtn found:', !!addBtn);
if (addBtn) {
  await addBtn.click();
  await page.waitForTimeout(3000);
}
await page.screenshot({ path: '/tmp/e2e-rose/final/02-after-add.png', fullPage: true });

const cartLocal = await page.evaluate(() => localStorage.getItem('merfy:cartItems'));
log('  localStorage cart:', cartLocal);

// Check all merfy:* keys
const allLocalKeys = await page.evaluate(() => {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith('merfy:') || k?.includes('cart')) {
      out[k] = localStorage.getItem(k);
    }
  }
  return out;
});
log('  all cart-related localStorage:', JSON.stringify(allLocalKeys, null, 2).slice(0, 500));

log('=== 4. Visit /cart ===');
await page.goto('https://dde2b0280a90.merfy.ru/cart');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/e2e-rose/final/03-cart.png', fullPage: true });

const cartHasItem = await page.evaluate(() => !document.body.innerText.includes('пока не добавили товар'));
log('  cart has items:', cartHasItem);

const cartContent = await page.evaluate(() => {
  const el = document.querySelector('[data-block="cart"], main');
  return el?.innerText?.slice(0, 500);
});
log('  cart text excerpt:', cartContent);

log('=== 5. /checkout — fill form ===');
await page.goto('https://dde2b0280a90.merfy.ru/checkout');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(4000);

const fillByLabelOrId = async (selectors, value) => {
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) {
      await el.fill(value);
      return sel;
    }
  }
  return null;
};

log('  email:', await fillByLabelOrId(['#checkout-email', 'input[name="email"]', 'input[autocomplete="email"]'], 'final@test.com'));
log('  phone:', await fillByLabelOrId(['#checkout-phone', 'input[name="phone"]', 'input[autocomplete="tel"]'], '79991234567'));
log('  firstName:', await fillByLabelOrId(['input[name="firstName"]', 'input[autocomplete="given-name"]'], 'Иван'));
log('  lastName:', await fillByLabelOrId(['input[name="lastName"]', 'input[autocomplete="family-name"]'], 'Тестов'));

// City + DaData (must click suggestion)
log('  city:', await fillByLabelOrId(['input[name="city"]', 'input[autocomplete="address-level2"]'], 'Москва'));
await page.waitForTimeout(2500);
const cityFirst = await page.$('ul li:first-of-type, .dadata-suggestion:first-of-type, [role="option"]:first-of-type');
if (cityFirst) {
  await cityFirst.click();
  log('  city suggestion clicked');
}
await page.waitForTimeout(1500);

log('  street:', await fillByLabelOrId(['input[name="address"]', 'input[name="street"]', 'input[autocomplete="address-line1"]'], 'Тверская 10'));
await page.waitForTimeout(2500);
const addrFirst = await page.$('ul li:first-of-type, .dadata-suggestion:first-of-type, [role="option"]:first-of-type');
if (addrFirst) {
  await addrFirst.click();
  log('  address suggestion clicked');
}
await page.waitForTimeout(1500);

log('  building:', await fillByLabelOrId(['input[name="building"]', 'input[name="house"]', 'input[autocomplete="address-line2"]'], '15'));
log('  postalCode:', await fillByLabelOrId(['input[name="postalCode"]', 'input[autocomplete="postal-code"]'], '123100'));

await page.screenshot({ path: '/tmp/e2e-rose/final/04-filled.png', fullPage: true });

log('=== 6. Wait + check delivery options ===');
await page.waitForTimeout(6000);
const radios = await page.evaluate(() => {
  const list = Array.from(document.querySelectorAll('input[type="radio"]'));
  return list.map(r => ({ name: r.name, value: r.value, label: r.closest('label')?.innerText?.trim()?.slice(0, 80) }));
});
log('  radios:', JSON.stringify(radios, null, 2));

await page.screenshot({ path: '/tmp/e2e-rose/final/05-delivery.png', fullPage: true });

// Try select first non-payment delivery method
const cdek = await page.$('label:has-text("СДЭК") input, label:has-text("Курьер") input, input[value="cdek"]');
if (cdek) {
  await cdek.click();
  await page.waitForTimeout(2000);
  log('  CDEK selected');
} else {
  // Try first delivery radio
  const firstDelivery = radios.find(r => r.name === 'delivery' || r.name === 'deliveryMethod');
  if (firstDelivery) {
    await page.evaluate((r) => {
      const inp = document.querySelector(`input[name="${r.name}"][value="${r.value}"]`);
      if (inp) { inp.checked = true; inp.dispatchEvent(new Event('change', { bubbles: true })); }
    }, firstDelivery);
    log('  fallback selected:', firstDelivery.name, firstDelivery.value);
    await page.waitForTimeout(2000);
  }
}

log('=== 7. Apply ROSE10 promo ===');
const promoToggle = await page.$('a:has-text("У меня есть промокод"), button:has-text("промокод")');
if (promoToggle) {
  await promoToggle.click();
  log('  promo toggle clicked');
}
await page.waitForTimeout(500);

const promoInput = await page.$('input[name="promoCode"], input[placeholder*="промокод" i], input[placeholder*="ромокод" i]');
if (promoInput) {
  await promoInput.fill('ROSE10');
  log('  promo filled');
  const applyBtn = await page.$('button:has-text("Применить")');
  if (applyBtn) {
    await applyBtn.click();
    log('  apply clicked');
    await page.waitForTimeout(3500);
  }
}
await page.screenshot({ path: '/tmp/e2e-rose/final/06-promo.png', fullPage: true });

// Check totals area
const totalsText = await page.evaluate(() => {
  const total = document.querySelector('[data-checkout-total], .checkout-total, [data-total]');
  if (total) return total.innerText.slice(0, 200);
  // Fallback: find any element with "Итого"
  const all = Array.from(document.querySelectorAll('*'));
  const found = all.find(el => el.children.length === 0 && /Итого/.test(el.innerText));
  return found?.parentElement?.innerText?.slice(0, 300);
});
log('  totals text:', totalsText);

const submitBtn = await page.$('button:has-text("Оплатить"), button[data-checkout-submit]');
const submitText = submitBtn ? await submitBtn.innerText() : null;
const submitDisabled = submitBtn ? await submitBtn.isDisabled() : null;
log('  submit:', submitText, 'disabled:', submitDisabled);

log('=== 8. Submit attempt ===');
if (submitBtn && !submitDisabled) {
  // Listen for navigation/network
  const reqPromise = page.waitForResponse(r => r.url().includes('/orders') || r.url().includes('/checkout'), { timeout: 15000 }).catch(() => null);
  await submitBtn.click();
  const resp = await reqPromise;
  if (resp) {
    log('  response:', resp.status(), resp.url());
    try {
      const body = await resp.text();
      log('  response body:', body.slice(0, 400));
    } catch {}
  }
  await page.waitForTimeout(5000);
  log('  URL after submit:', page.url());
  await page.screenshot({ path: '/tmp/e2e-rose/final/07-submitted.png', fullPage: true });
}

await browser.close();
console.log('=== DONE ===');
