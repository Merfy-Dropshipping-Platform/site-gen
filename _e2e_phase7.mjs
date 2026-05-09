import { chromium } from 'playwright';

const SITE = 'https://dde2b0280a90.merfy.ru';
const OUT = '/tmp/e2e-rose/customer';

const log = (msg) => console.log(`[phase7] ${msg}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
});
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('requestfailed', (req) => errors.push(`reqfail: ${req.url()} ${req.failure()?.errorText}`));

const results = {};

async function visit(name, url, extra) {
  log(`visiting ${name}: ${url}`);
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const status = resp?.status();
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  if (extra) await extra(page);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  const title = await page.title();
  const productCount = await page.evaluate(() => document.querySelectorAll('[data-product-id]').length);
  results[name] = { status, title, productCount, url };
  log(`  status=${status} title="${title}" products=${productCount}`);
}

try {
  // Phase 7.1: Home
  await visit('home', `${SITE}/`);

  // Phase 7.2: Catalog
  await visit('catalog', `${SITE}/catalog`);

  // Phase 7.3: Catalog filtered URBAN
  await visit('catalog-urban', `${SITE}/catalog?collection=urban`);

  // Phase 7.4: Collection page (try slug first, then ID)
  await visit('collection-urban', `${SITE}/collections/urban`);

  // Find first product handle from /catalog DOM
  log('finding first product handle...');
  await page.goto(`${SITE}/catalog`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3000);
  const handle = await page.evaluate(() => {
    const el = document.querySelector('article[data-product-handle]');
    return el ? el.getAttribute('data-product-handle') : null;
  });
  log(`first product handle: ${handle}`);
  results.firstProductHandle = handle;

  if (handle) {
    await visit('product', `${SITE}/product/${handle}`);
  } else {
    log('NO PRODUCT HANDLE FOUND on /catalog');
    results.product = { status: 'NOT_FOUND', error: 'no [data-product-handle] in /catalog DOM' };
  }
} catch (e) {
  log(`ERROR: ${e.message}`);
  errors.push(`fatal: ${e.message}`);
}

console.log('\n=== RESULTS ===');
console.log(JSON.stringify(results, null, 2));
console.log('\n=== ERRORS ===');
console.log(JSON.stringify(errors.slice(0, 30), null, 2));

await browser.close();
