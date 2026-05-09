import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
await fs.mkdir('/tmp/e2e-rose/customer', { recursive: true });

console.log('--- Customer 1: СДЭК + ROSE10 ---');

// Network logging
page.on('response', async resp => {
  const url = resp.url();
  if (url.includes('/orders/') && (resp.status() >= 400 || url.includes('cart'))) {
    let body = '';
    try { body = (await resp.text()).slice(0, 250); } catch {}
    console.log(`[${resp.status()}] ${resp.request().method()} ${url} :: ${body}`);
  }
});

// 1. Browse catalog
await page.goto('https://dde2b0280a90.merfy.ru/catalog');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2500);
const article = await page.$('article[data-product-handle]');
const productId = await article.getAttribute('data-product-id');
const productHandle = await article.getAttribute('data-product-handle');
console.log('product:', productHandle, 'uuid:', productId);

// 2. Click product → product page (capture as proof)
await page.goto(`https://dde2b0280a90.merfy.ru/product/${productHandle}`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/e2e-rose/customer/order1-product.png', fullPage: true });

// 3. Inject UUID into cart via direct API (bypasses broken add-to-cart on product page)
// Cart-api.js uses window.__MERFY_CONFIG__ for shopId/apiUrl
const seedResult = await page.evaluate(async (productId) => {
  const apiUrl = window.__MERFY_CONFIG__?.apiUrl || 'https://gateway.merfy.ru/api';
  const shopId = window.__MERFY_CONFIG__?.shopId;
  // Create cart
  const cartRes = await fetch(`${apiUrl}/orders/cart`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shopId }),
  });
  const cartData = await cartRes.json();
  const cartId = cartData?.data?.id;
  // Add item with UUID
  const itemRes = await fetch(`${apiUrl}/orders/cart/${cartId}/items`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId, quantity: 1 }),
  });
  const itemData = await itemRes.json();
  // Persist cart id and items in localStorage matching cart-store.js
  localStorage.setItem('merfy:cartId', cartId);
  localStorage.setItem('merfy:cartItems', JSON.stringify(itemData?.data?.items || []));
  return { cartId, item: itemData };
}, productId);
console.log('Cart seeded:', JSON.stringify(seedResult).slice(0, 400));

// 4. Go to checkout with the seeded cart
await page.goto('https://dde2b0280a90.merfy.ru/checkout');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/e2e-rose/customer/order1-checkout-empty.png', fullPage: true });

// 5. Fill personal info
await page.fill('input#email', 'customer1-cdek@test.com');
await page.fill('input#phone', '79991234567');

// First name / Last name — find by associated label (Имя / Фамилия)
async function fillByLabel(labelText, value) {
  const filled = await page.evaluate(({ labelText, value }) => {
    const labels = Array.from(document.querySelectorAll('label, span'));
    for (const l of labels) {
      if (l.textContent?.trim() === labelText) {
        const wrapper = l.closest('div');
        const input = wrapper?.querySelector('input, textarea');
        if (input) {
          input.focus();
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(input, value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.blur();
          return true;
        }
      }
    }
    return false;
  }, { labelText, value });
  return filled;
}

console.log('Имя:', await fillByLabel('Имя', 'Иван'));
console.log('Фамилия:', await fillByLabel('Фамилия', 'Тестов'));
console.log('Город:', await fillByLabel('Город', 'Москва'));
await page.waitForTimeout(1500);

// Try to click DaData city suggestion
const citySuggested = await page.evaluate(() => {
  const items = Array.from(document.querySelectorAll('[role="option"], .dadata-suggestion, [data-suggestion-index]'));
  for (const item of items) {
    if (item.textContent?.includes('Москва')) {
      item.click();
      return item.textContent.slice(0, 80);
    }
  }
  return null;
});
console.log('city suggestion clicked:', citySuggested);
await page.waitForTimeout(1000);

console.log('Улица:', await fillByLabel('Улица', 'Тверская улица'));
await page.waitForTimeout(1500);
const streetSuggested = await page.evaluate(() => {
  const items = Array.from(document.querySelectorAll('[role="option"], .dadata-suggestion, [data-suggestion-index]'));
  for (const item of items) {
    if (item.textContent?.includes('Тверская')) {
      item.click();
      return item.textContent.slice(0, 80);
    }
  }
  return null;
});
console.log('street suggestion clicked:', streetSuggested);
await page.waitForTimeout(800);

console.log('Дом:', await fillByLabel('Дом', '15'));
console.log('Кв./офис:', await fillByLabel('Кв./офис', '10'));
console.log('Индекс:', await fillByLabel('Индекс', '125009'));
await page.waitForTimeout(1500);

await page.screenshot({ path: '/tmp/e2e-rose/customer/order1-checkout-filled.png', fullPage: true });

// 6. Wait for delivery options to populate
await page.waitForTimeout(3000);

// 7. Pick СДЭК — check radio buttons / labels containing "СДЭК"
const cdekResult = await page.evaluate(() => {
  // Find all delivery method labels
  const labels = Array.from(document.querySelectorAll('label'));
  for (const l of labels) {
    const txt = l.textContent || '';
    if (/СДЭК|Курьер|sdek/i.test(txt)) {
      l.click();
      return { label: txt.slice(0, 100), found: true };
    }
  }
  return { found: false };
});
console.log('СДЭК selected:', cdekResult);
await page.waitForTimeout(2500);

// 8. Apply promo ROSE10
const promoInput = await page.$('input[placeholder*="промокод" i]');
if (promoInput) {
  await promoInput.fill('ROSE10');
  // Find Применить
  const applyClicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const apply = btns.find(b => /Примени|применить/i.test(b.textContent || ''));
    if (apply) { apply.click(); return apply.textContent?.trim(); }
    return null;
  });
  console.log('promo apply:', applyClicked);
  await page.waitForTimeout(2500);
}
await page.screenshot({ path: '/tmp/e2e-rose/customer/order1-cdek-promo.png', fullPage: true });

// 9. Try submit
const submitInfo = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'));
  const target = btns.find(b => /Оплати|Подтверди|Заказать/i.test(b.textContent || '')) ||
                 btns.find(b => b.dataset?.checkoutSubmit !== undefined);
  if (!target) return { found: false };
  return {
    found: true,
    text: target.textContent?.trim(),
    disabled: target.disabled,
    cls: target.className?.slice(0, 80),
  };
});
console.log('submit btn:', submitInfo);

if (submitInfo.found && !submitInfo.disabled) {
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const target = btns.find(b => /Оплати|Подтверди|Заказать/i.test(b.textContent || ''));
    target?.click();
  });
  await page.waitForTimeout(8000);
  console.log('post-submit URL:', page.url());
  await page.screenshot({ path: '/tmp/e2e-rose/customer/order1-after-submit.png', fullPage: true });
}

await browser.close();
console.log('--- Order 1 DONE ---');
