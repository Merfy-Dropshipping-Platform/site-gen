import { chromium } from 'playwright';
const targets = [
  ['vanilla', 'https://e0a8a827f393.merfy.ru/product/noski-nabor'],
  ['bloom', 'https://f7593c5f8f8f.merfy.ru/product/maska-dlya-litsa-pitatelnaya'],
  ['flux', 'https://0b851c31925c.merfy.ru/product/noski-nabor'],
  ['satin', 'https://98d56b3e5e61.merfy.ru/product/sportivnyj-top'],
];
const browser = await chromium.launch({ headless: true });
for (const [theme, url] of targets) {
  const page = await browser.newPage({ viewport: { width: 1320, height: 900 } });
  const r = { theme };
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => {
      const e = document.querySelector('[data-product-price-current]');
      return e && (e.textContent || '').trim().length > 0;
    }, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    r.info = await page.evaluate(() => {
      const t = (s) => { const e = document.querySelector(s); return e ? (e.textContent || '').trim() : null; };
      return {
        title: t('[data-product-info] h1') || t('h1'),
        price: t('[data-product-price-current]'),
        chips: document.querySelectorAll('[data-variant-chip]').length,
        addBtn: t('[data-product-action="add-to-cart"]'),
        buyBtn: t('[data-product-action="buy-now"]'),
        font: getComputedStyle(document.querySelector('[data-product-info] h1') || document.body).fontFamily.split(',')[0],
      };
    });
    await page.screenshot({ path: `/tmp/pdp-${theme}.png`, fullPage: false });
  } catch (e) { r.error = String(e).slice(0, 150); }
  console.log(JSON.stringify(r));
  await page.close();
}
await browser.close();
