import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
await fs.mkdir('/tmp/e2e-rose/customer', { recursive: true });

console.log('--- Customer 2: Почта России (no promo) ---');

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

// Pick last article on catalog (different product)
await page.goto('https://dde2b0280a90.merfy.ru/catalog');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2500);
const articles = await page.$$('article[data-product-handle]');
const last = articles[articles.length - 1];
const lastHandle = await last.getAttribute('data-product-handle');
const lastId = await last.getAttribute('data-product-id');
console.log(`product: ${lastHandle} (${lastId})`);

await page.goto(`https://dde2b0280a90.merfy.ru/product/${lastHandle}`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/e2e-rose/customer/order2-product.png', fullPage: true });

// Add to cart
console.log('-- click add to cart --');
await page.click('button:has-text("Добавить в корзину")');
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/e2e-rose/customer/order2-after-add.png', fullPage: true });

// Checkout
await page.goto('https://dde2b0280a90.merfy.ru/checkout');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/e2e-rose/customer/order2-checkout-empty.png', fullPage: true });

// Fill personal info
await page.fill('input#email', 'customer2-pochta@test.com');
await page.fill('input#phone', '79997654321');
console.log('Имя:', await fillByLabel('Имя', 'Анна'));
console.log('Фамилия:', await fillByLabel('Фамилия', 'Покупатель'));
console.log('Город:', await fillByLabel('Город', 'Санкт-Петербург'));
await page.waitForTimeout(2000);
console.log('Улица:', await fillByLabel('Улица', 'Невский проспект'));
await page.waitForTimeout(2000);
console.log('Дом:', await fillByLabel('Дом', '28'));
console.log('Кв./офис:', await fillByLabel('Кв./офис', '5'));
console.log('Индекс:', await fillByLabel('Индекс', '191186'));
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/e2e-rose/customer/order2-checkout-filled.png', fullPage: true });

// Try selecting Почта России
const result = await page.evaluate(() => {
  const labels = Array.from(document.querySelectorAll('label'));
  for (const l of labels) {
    const txt = l.textContent || '';
    if (/Почт/i.test(txt)) { l.click(); return txt.slice(0, 100); }
  }
  return null;
});
console.log('Почта selected:', result);
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/e2e-rose/customer/order2-pochta.png', fullPage: true });

// No promo for this order
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
}
await page.screenshot({ path: '/tmp/e2e-rose/customer/order2-after-submit.png', fullPage: true });

console.log('\n=== ERRORS ===');
for (const e of errors) console.log(e);

await browser.close();
console.log('--- Order 2 DONE ---');
