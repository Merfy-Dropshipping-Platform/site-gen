import { chromium } from 'playwright';

const SITE = 'https://dde2b0280a90.merfy.ru';
const OUT = '/tmp/e2e-rose/customer';
const log = (m) => console.log(`[phase7b] ${m}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(`${SITE}/catalog`, { waitUntil: 'domcontentloaded' });
await page.waitForLoadState('networkidle').catch(() => {});
await page.waitForTimeout(3000);

// Inspect filter UI
const filterInfo = await page.evaluate(() => {
  // Look for any element with "URBAN" text
  const urbanCandidates = Array.from(document.querySelectorAll('button, a, label, li, [role="button"]'))
    .filter((el) => /urban/i.test(el.textContent || ''))
    .map((el) => ({
      tag: el.tagName,
      text: (el.textContent || '').trim().substring(0, 50),
      classes: el.className,
      hasClick: !!el.onclick,
      attrs: Array.from(el.attributes).reduce((acc, a) => { acc[a.name] = a.value.substring(0, 60); return acc; }, {}),
    }));
  // Look at catalog HTML for collection select
  const selects = Array.from(document.querySelectorAll('select')).map((s) => ({
    name: s.name,
    options: Array.from(s.options).map((o) => o.value + '=' + o.text).slice(0, 10),
  }));
  return { urbanCandidates: urbanCandidates.slice(0, 10), selects };
});
console.log('FILTER INFO:', JSON.stringify(filterInfo, null, 2));

// Find total products on full catalog (count after fetching)
const total = await page.evaluate(() => document.querySelectorAll('[data-product-id]').length);
log(`total products in catalog DOM: ${total}`);

// Try clicking URBAN if found
if (filterInfo.urbanCandidates.length > 0) {
  log('clicking URBAN candidate...');
  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('button, a, label, li, [role="button"]'))
      .find((el) => /urban/i.test(el.textContent || ''));
    if (el) el.click();
  });
  await page.waitForTimeout(2500);
  const filteredCount = await page.evaluate(() => document.querySelectorAll('[data-product-id]').length);
  log(`after URBAN click: ${filteredCount} products`);
  await page.screenshot({ path: `${OUT}/catalog-urban-clicked.png`, fullPage: true });
}

await browser.close();
console.log('Errors:', errors.slice(0, 5));
