import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();

const calls = [];
page.on('request', req => {
  const u = req.url();
  if (/api\/|gateway|orders|delivery/.test(u)) {
    calls.push({ method: req.method(), url: u });
  }
});
page.on('response', async res => {
  const u = res.url();
  if (/api\/|gateway|orders|delivery/.test(u)) {
    try {
      const text = await res.text();
      console.log(`[${res.status()}] ${res.request().method()} ${u}`);
      if (text.length < 500) console.log('  body:', text.slice(0, 500));
    } catch {}
  }
});

// Pre-populate cart
const createResp = await fetch('https://gateway.merfy.ru/api/orders/cart', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ shopId: '2b9aa824-6b7f-422e-8ac2-96b66f196513' }),
});
const cartData = await createResp.json();
const cartId = cartData?.data?.id;
console.log('CartId:', cartId);
await fetch(`https://gateway.merfy.ru/api/orders/cart/${cartId}/items`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ productId: '97662a7f-01a7-4c6b-8465-31480a978fc2', quantity: 1 }),
});
await page.goto('https://dde2b0280a90.merfy.ru/');
await page.evaluate((id) => { localStorage.setItem('merfy:cartId', id); }, cartId);

console.log('--- Navigating to /checkout ---');
await page.goto('https://dde2b0280a90.merfy.ru/checkout');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);

console.log('--- Filling form ---');
await page.fill('input#email', 'customer1@test.com');
await page.fill('input#phone', '79991234567');
await page.fill('input[autocomplete="given-name"]', 'Иван');
await page.fill('input[autocomplete="family-name"]', 'Тестов');
await page.fill('input[autocomplete="address-level2"]', 'Москва');
await page.waitForTimeout(2500);
const citySugg = await page.$('div[class*="ContextSearch"] li, [role="option"]');
console.log('city sugg found:', !!citySugg);
if (citySugg) await citySugg.click();
await page.waitForTimeout(2500);

await page.fill('input[autocomplete="address-line1"]', 'Тверская');
await page.waitForTimeout(2500);
const streetSugg = await page.$('div[class*="ContextSearch"] li, [role="option"]');
console.log('street sugg found:', !!streetSugg);
if (streetSugg) await streetSugg.click();
await page.waitForTimeout(2500);

await page.fill('input[autocomplete="address-line2"]', '10');
await page.fill('input[autocomplete="postal-code"]', '125009');
console.log('--- Waiting for delivery options ---');
await page.waitForTimeout(8000);

console.log('--- All API calls captured: ---');
calls.forEach(c => console.log(`  ${c.method} ${c.url}`));

await browser.close();
