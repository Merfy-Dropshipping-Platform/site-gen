import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();

await page.goto('https://dde2b0280a90.merfy.ru/checkout');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);

await page.fill('input[autocomplete="address-level2"]', 'Москв');
await page.waitForTimeout(3000);

// Inspect what DaData renders
const html = await page.evaluate(() => {
  const cityInput = document.querySelector('input[autocomplete="address-level2"]');
  const wrapper = cityInput?.closest('.relative, [class*="search"]');
  return {
    parentHTML: wrapper?.parentElement?.outerHTML?.slice(0, 2000),
    siblingsAfter: Array.from(cityInput?.parentElement?.parentElement?.children || []).slice(-3).map(el => el.outerHTML?.slice(0, 300)),
  };
});
console.log(JSON.stringify(html, null, 2));

await browser.close();
