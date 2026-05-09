import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();

page.on('response', async resp => {
  const url = resp.url();
  if (url.includes('/api/') || url.includes('/cart') || resp.status() >= 400) {
    let body = '';
    try { body = (await resp.text()).slice(0, 400); } catch {}
    console.log(`[${resp.status()}] ${resp.request().method()} ${url} :: ${body}`);
  }
});
page.on('request', req => {
  const url = req.url();
  if (url.includes('/api/') || url.includes('/cart')) {
    console.log(`> ${req.method()} ${url} body=${req.postData()?.slice(0, 200) || ''}`);
  }
});

await page.goto('https://dde2b0280a90.merfy.ru/product/sumka-spring-10');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);

console.log('--- click add to cart ---');
const addBtn = await page.$('button:has-text("Добавить в корзину")');
if (addBtn) await addBtn.click();
await page.waitForTimeout(4000);

const cart = await page.evaluate(() => localStorage.getItem('merfy:cartItems'));
console.log('cartItems FINAL:', cart);

await browser.close();
