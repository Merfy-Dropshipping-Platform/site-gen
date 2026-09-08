import { chromium } from 'playwright';
const URL = 'https://gateway.merfy.ru/api/sites/ef6e5979-c4ea-41d7-a70f-50d79af03ace/preview?page=home';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errs = [], cons = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') cons.push(m.text().slice(0, 200)); });
const res = { url: URL };
try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page.waitForTimeout(3500);
  res.globals = await page.evaluate(() => ({
    siteId: window.__MERFY_SITE_ID__,
    defaultPid: window.__MERFY_DEFAULT_PRODUCT_ID__,
    theme: window.__MERFY_THEME__,
    productBlockId: window.__MERFY_PRODUCT_BLOCK_ID__,
    globalProducts: (window.__MERFY_PRODUCTS__ || []).length,
    merfyRoot: typeof window.__merfyRoot,
  }));
  res.sections = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[data-block="product"]')).map((s) => ({
      blockId: s.getAttribute('data-puck-component-id'),
      title: (s.querySelector('[data-product-info] h1')?.textContent || '').trim(),
      price: (s.querySelector('[data-product-price-current]')?.textContent || '').trim(),
      chips: s.querySelectorAll('[data-variant-chip]').length,
      activeChip: (s.querySelector('[data-variant-chip][data-variant-active="true"]')?.textContent || '').trim(),
      heroSrc: (s.querySelector('[data-product-hero-image]')?.getAttribute('src') || '').slice(-36),
      subsectionParents: s.querySelectorAll('[data-puck-subsection-parent]').length,
      // у обеих секций совпадают ли data-puck-subsection-parent с их blockId?
      subParentVals: Array.from(new Set(Array.from(s.querySelectorAll('[data-puck-subsection-parent]')).map((e) => e.getAttribute('data-puck-subsection-parent')))),
    }));
  });
  res.docTitle = await page.title();
  // первая Product-секция в кадр + скрин
  await page.evaluate(() => { const s = document.querySelector('[data-block="product"]'); if (s) s.scrollIntoView({ block: 'center' }); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/preview-home-product.png', fullPage: false });
  res.ok = true;
} catch (e) { res.ok = false; res.error = String(e).slice(0, 200); }
res.pageErrors = errs;
res.consoleErrors = cons.slice(0, 8);
console.log(JSON.stringify(res, null, 1));
await browser.close();
