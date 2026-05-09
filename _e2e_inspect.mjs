import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();

await page.goto('https://dde2b0280a90.merfy.ru/catalog', { waitUntil: 'domcontentloaded' });
await page.waitForLoadState('networkidle').catch(() => {});
await page.waitForTimeout(3000);

const info = await page.evaluate(() => {
  const productNodes = document.querySelectorAll('[data-product-id]');
  const sample = Array.from(productNodes).slice(0, 3).map((el) => {
    const a = el.querySelector('a');
    return {
      tag: el.tagName,
      id: el.getAttribute('data-product-id'),
      handle: el.getAttribute('data-product-handle'),
      href: a ? a.getAttribute('href') : null,
      html: el.outerHTML.substring(0, 500),
    };
  });
  const allLinks = Array.from(document.querySelectorAll('a[href]'))
    .map((a) => a.getAttribute('href'))
    .filter((h) => h && (h.includes('product') || h.includes('catalog')))
    .slice(0, 20);
  return { count: productNodes.length, sample, allLinks };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
