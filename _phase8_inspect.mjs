import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();

// Add product to cart first
await page.goto('https://dde2b0280a90.merfy.ru/catalog');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2500);
const handle = await page.$eval('article[data-product-handle]', el => el.getAttribute('data-product-handle'));
console.log('handle:', handle);

await page.goto(`https://dde2b0280a90.merfy.ru/product/${handle}`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);

// Find add-to-cart button
const buttons = await page.$$eval('button', els => els.map(e => ({
  text: e.textContent?.trim(),
  cls: e.className,
  id: e.id,
})));
console.log('buttons on product page:');
for (const b of buttons.slice(0, 15)) console.log('  ', b);

// Click add-to-cart
const addBtn = await page.$('button:has-text("Добавить в корзину")');
if (addBtn) {
  await addBtn.click();
  await page.waitForTimeout(2000);
  console.log('add to cart clicked');
}

// Check cart in localStorage
const cart = await page.evaluate(() => {
  const items = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    items.push({ key: k, value: localStorage.getItem(k)?.slice(0, 200) });
  }
  return items;
});
console.log('localStorage:', JSON.stringify(cart, null, 2));

// Go to checkout
await page.goto('https://dde2b0280a90.merfy.ru/checkout');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);

// Inspect form fields
const inputs = await page.$$eval('input, select, textarea', els => els.map(e => ({
  tag: e.tagName,
  type: e.type,
  name: e.name,
  id: e.id,
  placeholder: e.placeholder,
  cls: e.className?.slice(0, 80),
})));
console.log('\ncheckout inputs:');
for (const i of inputs) console.log('  ', i);

const labels = await page.$$eval('label', els => els.slice(0, 30).map(e => ({
  text: e.textContent?.trim()?.slice(0, 60),
  for: e.htmlFor,
})));
console.log('\ncheckout labels:');
for (const l of labels) console.log('  ', l);

await browser.close();
