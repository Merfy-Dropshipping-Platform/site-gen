// Try adding to cart by:
// 1. Going to catalog (DOM has UUIDs)
// 2. Clicking via catalog (script may use UUID)
// 3. If still broken, inject item to cart via API directly using known UUID
import { chromium } from 'playwright';

const SITE = 'https://dde2b0280a90.merfy.ru';
const SHOP_ID = '2b9aa824-6b7f-422e-8ac2-96b66f196513';
const TENANT_ID = 'dde2b028-0a90-4d86-a6f1-1f0163553bda';
const PRODUCT_UUID = '97662a7f-01a7-4c6b-8465-31480a978fc2';
const log = (m) => console.log(`[apidirect] ${m}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const apiCalls = [];
page.on('request', (req) => {
  const u = req.url();
  if (/orders\/cart|api\/orders/.test(u)) apiCalls.push({ phase: 'req', method: req.method(), url: u, body: req.postData()?.substring(0, 400) });
});
page.on('response', async (resp) => {
  const u = resp.url();
  if (!/orders\/cart|api\/orders/.test(u)) return;
  let body = null;
  try { body = (await resp.text()).substring(0, 500); } catch {}
  apiCalls.push({ phase: 'resp', status: resp.status(), url: u, body });
});

try {
  // Try via catalog click (test if catalog click sends UUID vs handle)
  await page.goto(`${SITE}/catalog`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3000);

  // Click first product card
  log('clicking first product card on catalog');
  await page.evaluate(() => {
    const card = document.querySelector('article[data-product-id]');
    if (card) card.click();
  });
  await page.waitForTimeout(3500);
  log(`URL after card click: ${page.url()}`);

  // Now try add to cart on product page (may have hydrated UUID)
  await page.waitForTimeout(2000);
  const addBtnExists = await page.evaluate(() => {
    return !!Array.from(document.querySelectorAll('button')).find((b) => /Добавить в корзину/.test(b.textContent || ''));
  });
  log(`add btn on product page: ${addBtnExists}`);

  if (addBtnExists) {
    log('CLICK Add to Cart');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => /Добавить в корзину/.test(b.textContent || ''));
      if (btn) btn.click();
    });
    await page.waitForTimeout(4000);
    const cartItems = await page.evaluate(() => localStorage.getItem('merfy:cartItems'));
    log(`cartItems: ${cartItems}`);
  }

  // Direct API call: skip the buggy storefront and POST cart item with UUID
  log('--- direct API workaround ---');
  const result = await page.evaluate(async ({ shopId, productUuid }) => {
    const r = await fetch('https://gateway.merfy.ru/api/orders/cart', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ shopId }),
    });
    const j = await r.json();
    if (!j.success) return { step: 'create', error: j };
    const cartId = j.data.id;
    const r2 = await fetch(`https://gateway.merfy.ru/api/orders/cart/${cartId}/items`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: productUuid, quantity: 1 }),
    });
    const j2 = await r2.json();
    return { cartId, addItem: j2 };
  }, { shopId: SHOP_ID, productUuid: PRODUCT_UUID });
  log(`direct API result: ${JSON.stringify(result, null, 2)}`);
} catch (e) {
  log(`ERR: ${e.message}`);
}

console.log('\n=== API CALLS ===');
for (const c of apiCalls) console.log(JSON.stringify(c).substring(0, 400));

await browser.close();
