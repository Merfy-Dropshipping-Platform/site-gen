import { chromium } from 'playwright';

const SITE = 'https://9c1c6fa8be34.merfy.ru';
const SHOP = '71f9b323-de3c-4f74-9e08-85c274493735';
const PRODUCT = 'eb66872b-50ae-4d6e-b938-198c157e30a7';
const API = 'https://gateway.merfy.ru/api';

const r1 = await fetch(`${API}/store/carts`, {
  method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ store_id: SHOP }),
});
const { cart } = await r1.json();
const cartId = cart.id;
console.log('cartId', cartId);
await fetch(`${API}/store/carts/${cartId}/items`, {
  method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ product_id: PRODUCT, quantity: 1 }),
});

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'ru-RU', viewport: {width:1440,height:900} });
const page = await ctx.newPage();

page.on('request', r => {
  if (r.url().includes('delivery') || r.url().includes('cdek') || r.url().includes('dadata')) {
    console.log('REQ', r.method(), r.url());
    if (r.method() === 'POST') console.log('  body:', r.postData()?.slice(0,200));
  }
});
page.on('response', async r => {
  if (r.url().includes('delivery/calculate')) {
    const j = await r.json().catch(() => null);
    console.log('RESP', r.status(), 'tariffs=', j?.data?.tariffs?.length, 'pickup=', j?.data?.pickupAvailable, 'custom=', j?.data?.customProfiles?.length);
  }
});

await page.goto(SITE+'/', {waitUntil:'domcontentloaded', timeout:30000});
await page.evaluate(id=>{localStorage.setItem('merfy:cartId',id);localStorage.setItem('merfy_cart_id',id);}, cartId);
await page.goto(SITE+'/checkout', {waitUntil:'domcontentloaded', timeout:30000});
await page.waitForSelector('[data-checkout-slot="contact"]', {timeout:15000});
await page.waitForTimeout(2500);

const addr = page.locator('input[autocomplete="street-address"]').first();
await addr.waitFor({state:'visible', timeout:20000});
await addr.click();
await addr.fill('');
// Type letter-by-letter to match user behavior
for (const ch of 'г Самара, ул Стара Загора, д 16') {
  await addr.type(ch, {delay: 30});
}
await page.waitForTimeout(2500);
console.log('--- before click ---');

// Click first dropdown item
const lis = await page.locator('ul li:visible').all();
if (lis.length) {
  console.log('list[0]:', await lis[0].textContent());
  const box = await lis[0].boundingBox();
  await page.mouse.click(box.x + box.width/2, box.y + box.height/2);
  console.log('clicked');
}
await page.waitForTimeout(4000);

const state = await page.evaluate(() => {
  const a = document.querySelector('input[autocomplete="street-address"]');
  const i = document.querySelector('input[autocomplete="postal-code"]');
  return { addr: a?.value, idx: i?.value };
});
console.log('inputs:', state);

const msg = await page.$eval('[data-checkout-slot="delivery-method"] p', e=>e.textContent?.trim()).catch(()=>null);
const choices = await page.$$eval('[data-checkout-slot="delivery-method"] label', els=>els.length);
console.log('msg:', msg);
console.log('choices count:', choices);

await ctx.close(); await browser.close();
