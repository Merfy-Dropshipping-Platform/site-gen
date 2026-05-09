import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();

await page.goto('https://dde2b0280a90.merfy.ru/catalog');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2500);

// Sample all anchor hrefs
const links = await page.$$eval('a', els => els.slice(0, 50).map(e => e.getAttribute('href')));
console.log('first 50 anchors:');
for (const h of links) console.log('  ', h);

// Try to find product cards
const productCards = await page.$$eval('[class*="product"], [data-product], article', els => els.slice(0, 5).map(e => ({
  tag: e.tagName,
  cls: e.className,
  inner: e.innerHTML.slice(0, 200),
})));
console.log('\nproduct-like elements:');
for (const p of productCards) console.log('  ', p);

await browser.close();
