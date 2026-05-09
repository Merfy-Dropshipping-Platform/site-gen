import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
await page.goto('https://8bb11302e214.merfy.ru/checkout?_=' + Date.now(), { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2500);
const r = await page.evaluate(() => {
  const btn = document.querySelector('[data-checkout-slot="submit"] button');
  const promo = document.querySelector('[data-checkout-slot="order-summary"] button');
  return {
    submitCls: btn?.className,
    promoCls: promo?.className,
  };
});
console.log(JSON.stringify(r, null, 2));
await browser.close();
