import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
await fs.mkdir('/tmp/e2e-rose/customer', { recursive: true });

console.log('--- Customer 1: СДЭК + ROSE10 ---');

const errors = [];
page.on('response', async resp => {
  if (resp.status() >= 400 && resp.url().includes('gateway.merfy.ru')) {
    let body = '';
    try { body = (await resp.text()).slice(0, 300); } catch {}
    errors.push(`[${resp.status()}] ${resp.request().method()} ${resp.url()} :: ${body}`);
  }
});

async function fillByLabel(labelText, value) {
  return await page.evaluate(({ labelText, value }) => {
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
}

// 1. Browse catalog → product
await page.goto('https://dde2b0280a90.merfy.ru/catalog');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2500);
const article = await page.$('article[data-product-handle]');
const productHandle = await article.getAttribute('data-product-handle');
const productId = await article.getAttribute('data-product-id');
console.log(`product: ${productHandle} (${productId})`);

await page.goto(`https://dde2b0280a90.merfy.ru/product/${productHandle}`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/e2e-rose/customer/order1-product.png', fullPage: true });

// 2. Click "Добавить в корзину" — captures real flow (will fail with 400 but proves journey)
console.log('-- Clicking add to cart --');
await page.click('button:has-text("Добавить в корзину")');
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/e2e-rose/customer/order1-after-add.png', fullPage: true });

// 3. Go to checkout
await page.goto('https://dde2b0280a90.merfy.ru/checkout');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/e2e-rose/customer/order1-checkout-empty.png', fullPage: true });

// 4. Fill all fields
await page.fill('input#email', 'customer1-cdek@test.com');
await page.fill('input#phone', '79991234567');
console.log('Имя:', await fillByLabel('Имя', 'Иван'));
console.log('Фамилия:', await fillByLabel('Фамилия', 'Тестов'));
console.log('Город:', await fillByLabel('Город', 'Москва'));
await page.waitForTimeout(2000);
console.log('Улица:', await fillByLabel('Улица', 'Тверская улица'));
await page.waitForTimeout(2000);
console.log('Дом:', await fillByLabel('Дом', '15'));
console.log('Кв./офис:', await fillByLabel('Кв./офис', '10'));
console.log('Индекс:', await fillByLabel('Индекс', '125009'));
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/e2e-rose/customer/order1-checkout-filled.png', fullPage: true });

// 5. Inspect what delivery options appear post-fill
const radios = await page.$$eval('input[type="radio"]', els => els.map(e => ({
  name: e.name,
  parentText: e.parentElement?.textContent?.trim()?.slice(0, 80),
})));
console.log('radios after fill:', radios);

// 6. Click СДЭК (label-based)
const cdekResult = await page.evaluate(() => {
  const labels = Array.from(document.querySelectorAll('label'));
  for (const l of labels) {
    const txt = l.textContent || '';
    if (/СДЭК/i.test(txt)) { l.click(); return txt.slice(0, 100); }
  }
  return null;
});
console.log('СДЭК selected:', cdekResult);
await page.waitForTimeout(2500);

// 7. Apply ROSE10 promo
const promoInput = await page.$('input[placeholder*="промокод" i]');
if (promoInput) {
  await promoInput.fill('ROSE10');
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

// 8. Try submit
const submitInfo = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'));
  const target = btns.find(b => /Оплати|Подтверди|Заказать/i.test(b.textContent || ''));
  if (!target) return { found: false };
  return { found: true, text: target.textContent?.trim(), disabled: target.disabled };
});
console.log('submit:', submitInfo);

if (submitInfo.found && !submitInfo.disabled) {
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const t = btns.find(b => /Оплати|Подтверди|Заказать/i.test(b.textContent || ''));
    t?.click();
  });
  await page.waitForTimeout(8000);
  console.log('post-submit URL:', page.url());
  await page.screenshot({ path: '/tmp/e2e-rose/customer/order1-after-submit.png', fullPage: true });
} else {
  console.log('Submit blocked — capturing state');
  await page.screenshot({ path: '/tmp/e2e-rose/customer/order1-after-submit.png', fullPage: true });
}

console.log('\n=== ERRORS during run ===');
for (const e of errors) console.log(e);

await browser.close();
console.log('--- Order 1 DONE ---');
