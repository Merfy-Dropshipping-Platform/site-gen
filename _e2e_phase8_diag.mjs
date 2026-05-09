import { chromium } from 'playwright';

const SITE = 'https://dde2b0280a90.merfy.ru';
const log = (m) => console.log(`[diag] ${m}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const apiCalls = [];

page.on('request', async (req) => {
  const u = req.url();
  if (!/orders\/cart|api\/orders/.test(u)) return;
  let body = null;
  try { body = req.postData(); } catch (e) {}
  apiCalls.push({ phase: 'req', method: req.method(), url: u, body: body?.substring(0, 500) });
});

page.on('response', async (resp) => {
  const u = resp.url();
  if (!/orders\/cart|api\/orders/.test(u)) return;
  let text = null;
  try { text = (await resp.text()).substring(0, 800); } catch (e) {}
  apiCalls.push({ phase: 'resp', status: resp.status(), url: u, body: text });
});

try {
  await page.goto(`${SITE}/product/sumka-spring-10`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3000);

  // First inspect product DOM for variant selection
  const productInfo = await page.evaluate(() => {
    return {
      title: document.querySelector('h1')?.textContent?.trim(),
      variantSelectors: Array.from(document.querySelectorAll('select, [data-variant]')).map((s) => ({
        tag: s.tagName,
        name: s.name,
        options: s.tagName === 'SELECT' ? Array.from(s.options).map((o) => `${o.value}=${o.text}`).slice(0, 8) : null,
        attrs: Array.from(s.attributes).reduce((a, b) => { a[b.name] = b.value.substring(0, 60); return a; }, {}),
      })),
      addToCartBtn: !!Array.from(document.querySelectorAll('button')).find((b) => /Добавить в корзину/.test(b.textContent || '')),
      productJson: window.__MERFY_CONFIG__ ? Object.keys(window.__MERFY_CONFIG__) : null,
      shopId: window.__MERFY_CONFIG__?.shopId,
      siteId: window.__MERFY_CONFIG__?.siteId,
    };
  });
  log(`product: ${JSON.stringify(productInfo, null, 2)}`);

  log('clicking Добавить в корзину');
  await page.locator('button:has-text("Добавить в корзину")').first().click();
  await page.waitForTimeout(4000);

  // Cart items state
  const cartItems = await page.evaluate(() => {
    return {
      cartItems: localStorage.getItem('merfy:cartItems'),
      cartId: localStorage.getItem('merfy:cartId'),
      // Try fetching from API via fetch
    };
  });
  log(`cart state: ${JSON.stringify(cartItems)}`);
} catch (e) {
  log(`ERR: ${e.message}`);
}

console.log('\n=== API CALLS ===');
for (const c of apiCalls) {
  console.log(JSON.stringify(c).substring(0, 600));
}

await browser.close();
