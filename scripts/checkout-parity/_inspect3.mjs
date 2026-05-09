import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
await page.goto('https://8bb11302e214.merfy.ru/checkout', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2500);
const colors = await page.evaluate(() => {
  const body = document.body;
  const btn = document.querySelector('[data-checkout-slot="submit"] button');
  const cs = getComputedStyle(btn || body);
  return {
    bodyAccent: getComputedStyle(body).getPropertyValue('--color-accent'),
    btnAccent: getComputedStyle(btn).getPropertyValue('--color-accent'),
    bodyBg: getComputedStyle(body).getPropertyValue('--color-bg'),
    bodyText: getComputedStyle(body).getPropertyValue('--color-text'),
    btnBg: cs.backgroundColor,
    btnHasComponentParent: !!btn?.closest('.color-scheme-2'),
    docElText: getComputedStyle(document.documentElement).getPropertyValue('--color-text'),
    docElAccent: getComputedStyle(document.documentElement).getPropertyValue('--color-accent'),
  };
});
console.log(JSON.stringify(colors, null, 2));
await browser.close();
