import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
await fs.mkdir('/tmp/e2e-rose/customer-retry2', { recursive: true });

console.log('=== Pre-populate cart with UUID via API ===');
// Bypass slug-cart bug: directly populate cart via API
const createCartResp = await fetch('https://gateway.merfy.ru/api/orders/cart', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ shopId: '2b9aa824-6b7f-422e-8ac2-96b66f196513' }),
});
const cartData = await createCartResp.json();
const cartId = cartData?.data?.id;
console.log('  CartId:', cartId);

if (cartId) {
  const addResp = await fetch(`https://gateway.merfy.ru/api/orders/cart/${cartId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId: '97662a7f-01a7-4c6b-8465-31480a978fc2', quantity: 1 }),
  });
  const addJson = await addResp.json();
  console.log('  Add item response:', JSON.stringify(addJson).slice(0, 200));
}

// Set localStorage so frontend recognizes the cart
await page.goto('https://dde2b0280a90.merfy.ru/');
await page.evaluate((id) => {
  localStorage.setItem('merfy:cartId', id);
  localStorage.setItem('merfy:cartItems', JSON.stringify([]));
}, cartId);

console.log('=== Visit /cart ===');
await page.goto('https://dde2b0280a90.merfy.ru/cart');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/03b-cart-prefilled.png', fullPage: true });

const cartContent = await page.evaluate(() => {
  return {
    text: document.body.innerText.slice(0, 800),
    items: Array.from(document.querySelectorAll('[data-cart-item]')).length,
    cartLocal: localStorage.getItem('merfy:cartItems'),
  };
});
console.log('  Cart page:', JSON.stringify(cartContent, null, 2));

console.log('=== /checkout — fill form (real selectors) ===');
await page.goto('https://dde2b0280a90.merfy.ru/checkout');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/04b-checkout-init.png', fullPage: true });

// Probe what input fields exist
const fields = await page.evaluate(() => {
  const inputs = Array.from(document.querySelectorAll('input'));
  return inputs.map(i => ({
    name: i.name,
    id: i.id,
    type: i.type,
    placeholder: i.placeholder,
    visible: i.offsetWidth > 0 && i.offsetHeight > 0,
  }));
});
console.log('  Fields:', JSON.stringify(fields, null, 2));

// Fill what we can
try { await page.fill('input[name="email"]', 'customer1@test.com'); console.log('  email OK'); } catch (e) { console.log('  email FAIL:', e.message.slice(0, 100)); }
try { await page.fill('input[name="phone"]', '79991234567'); console.log('  phone OK'); } catch (e) { console.log('  phone FAIL'); }
try { await page.fill('input[name="firstName"]', 'Иван'); console.log('  firstName OK'); } catch (e) { console.log('  firstName FAIL'); }
try { await page.fill('input[name="lastName"]', 'Тестов'); console.log('  lastName OK'); } catch (e) { console.log('  lastName FAIL'); }

// Try address with autocomplete
try {
  await page.fill('input[name="address"]', 'Москва, Тверская 10');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/05b-after-address.png', fullPage: true });
  console.log('  address typed');
  // Find DaData suggestion
  const sugg = await page.$('.dadata-suggestion, [data-suggestion-list] li, [class*="suggestion"]');
  if (sugg) {
    await sugg.click();
    console.log('  suggestion clicked');
    await page.waitForTimeout(1500);
  } else {
    // try keyboard arrow + enter
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    console.log('  used keyboard fallback');
  }
} catch (e) { console.log('  address FAIL:', e.message.slice(0, 100)); }

try { await page.fill('input[name="postalCode"]', '123100'); console.log('  postalCode OK'); } catch (e) { console.log('  postalCode FAIL'); }

await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/05c-after-fill.png', fullPage: true });

// After address fill — wait for delivery options to render
console.log('=== Wait for delivery options ===');
await page.waitForTimeout(5000);

// Check radio buttons
const radios = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll('input[type="radio"]'));
  return els.map(r => ({
    name: r.name,
    value: r.value,
    checked: r.checked,
    label: r.closest('label')?.innerText?.trim().slice(0, 100),
  }));
});
console.log('  Radios:', JSON.stringify(radios, null, 2));

// Check delivery methods area more directly
const deliveryArea = await page.evaluate(() => {
  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, [class*="delivery"], [data-delivery-method]'));
  return headings.map(h => ({ tag: h.tagName, text: h.innerText?.slice(0, 100), classes: h.className?.slice(0, 80) }));
});
console.log('  Delivery elements:', JSON.stringify(deliveryArea, null, 2).slice(0, 1500));

await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/06b-after-wait.png', fullPage: true });

// Check totals
const totals = await page.evaluate(() => {
  const text = document.body.innerText;
  const lines = text.split('\n').filter(Boolean);
  return lines.filter(l => /итого|сумм|скид|доставк|товар|оплат/i.test(l)).slice(0, 30);
});
console.log('  Total-related lines:', JSON.stringify(totals, null, 2));

// Try ROSE10
const promoToggle = await page.$('a:has-text("промокод"), button:has-text("промокод")');
if (promoToggle) {
  await promoToggle.click().catch(() => {});
  await page.waitForTimeout(500);
}
const promoInput = await page.$('input[name="promoCode"], input[placeholder*="промокод" i]');
if (promoInput) {
  await promoInput.fill('ROSE10');
  const applyBtn = await page.$('button:has-text("Применить")');
  if (applyBtn) await applyBtn.click();
  await page.waitForTimeout(3000);
  console.log('  ROSE10 applied');
}
await page.screenshot({ path: '/tmp/e2e-rose/customer-retry2/07b-promo-applied.png', fullPage: true });

const finalTotals = await page.evaluate(() => {
  const text = document.body.innerText;
  return text.split('\n').filter(l => /итого|скид|промок|0\s*₽|\d+\s*₽/i.test(l)).slice(0, 20);
});
console.log('  Final totals:', JSON.stringify(finalTotals, null, 2));

const submitBtn = await page.$('button:has-text("Оплатить"), button[data-checkout-submit], button[type="submit"]');
if (submitBtn) {
  const text = await submitBtn.innerText().catch(() => '?');
  const disabled = await submitBtn.isDisabled().catch(() => null);
  console.log('  Submit:', text, 'disabled:', disabled);
}

await browser.close();
