import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();

page.on('response', async resp => {
  const url = resp.url();
  if (url.includes('/orders/cart') && resp.status() >= 400) {
    let body = '';
    try { body = (await resp.text()).slice(0, 300); } catch {}
    console.log(`[ERR ${resp.status()}] ${url} :: ${body}`);
  }
});
page.on('request', req => {
  const url = req.url();
  if (url.includes('/orders/cart')) {
    console.log(`> ${req.method()} ${url} body=${req.postData()?.slice(0, 200) || ''}`);
  }
});

await page.goto('https://dde2b0280a90.merfy.ru/catalog');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2500);

// Click on first article
const firstArt = await page.$('article[data-product-handle]');
const articleId = await firstArt.getAttribute('data-product-id');
const articleHandle = await firstArt.getAttribute('data-product-handle');
console.log('catalog article id:', articleId, 'handle:', articleHandle);

// Inspect possible buttons on catalog cards
const catBtns = await firstArt.$$eval('button', els => els.map(e => ({
  text: e.textContent?.trim()?.slice(0, 50),
  attrs: Array.from(e.attributes).map(a => `${a.name}="${a.value}"`).slice(0, 5),
})));
console.log('article buttons:', catBtns);

// Try clicking article (it's clickable)
await firstArt.click();
await page.waitForTimeout(2000);
console.log('post-click URL:', page.url());

// On product page, check what API call would be needed
// Inspect script that wires up data-product-add-to-cart
const scripts = await page.evaluate(() => {
  const links = Array.from(document.querySelectorAll('script[src]')).map(s => s.src);
  return links.filter(l => l.includes('/scripts/') || l.includes('product'));
});
console.log('scripts on product page:', scripts);

await browser.close();
