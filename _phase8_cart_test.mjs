import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();

// Listen to console errors
page.on('console', msg => {
  if (msg.type() === 'error' || msg.type() === 'warning') console.log('CONSOLE', msg.type(), msg.text());
});

await page.goto('https://dde2b0280a90.merfy.ru/product/sumka-spring-10');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);

// Capture all variant pickers if any
const variantBlocks = await page.$$eval('[data-variant-group], [data-variant-option], [class*="variant"], [class*="option"]', els => els.slice(0, 10).map(e => ({
  cls: e.className?.slice(0, 100),
  text: e.textContent?.trim()?.slice(0, 60),
})));
console.log('variant blocks:', variantBlocks);

// Click add to cart, see what happens
const addBtn = await page.$('button:has-text("Добавить в корзину")');
console.log('add btn found:', !!addBtn);
if (addBtn) {
  await addBtn.click();
  await page.waitForTimeout(3000);
}

const cart = await page.evaluate(() => localStorage.getItem('merfy:cartItems'));
console.log('cartItems after click:', cart);

// Maybe Cart is cart drawer that opens — check
const cartDrawer = await page.$$eval('[class*="cart-drawer"], [class*="cart"]', els => els.slice(0, 5).map(e => ({
  cls: e.className?.slice(0, 80),
  visible: !e.hasAttribute('hidden'),
  display: getComputedStyle(e).display,
})));
console.log('cart drawer state:', cartDrawer);

// Try clicking again with explicit wait
await page.waitForTimeout(2000);
const addBtn2 = await page.$('button:has-text("Добавить в корзину")');
if (addBtn2) {
  await addBtn2.click({ force: true });
  await page.waitForTimeout(3000);
}
const cart2 = await page.evaluate(() => localStorage.getItem('merfy:cartItems'));
console.log('cartItems after 2nd click:', cart2);

await browser.close();
