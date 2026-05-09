import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();

await page.goto('https://dde2b0280a90.merfy.ru/catalog');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);

// Click first product card and see where it navigates
const firstArt = await page.$('article[data-product-handle]');
const handle = await firstArt.getAttribute('data-product-handle');
console.log('first handle:', handle);

await firstArt.click();
await page.waitForTimeout(3000);
console.log('post-click URL:', page.url());

await browser.close();
