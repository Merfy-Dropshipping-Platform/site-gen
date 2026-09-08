import { chromium } from 'playwright';
const URL = 'https://1dw339dxomuy.merfy.ru/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
const jserr = [];
page.on('pageerror', (e) => jserr.push(String(e).slice(0, 160)));
const res = { url: URL, sections: [] };
try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);
  // Перечень всех Product-секций + их состояние
  res.sections = await page.evaluate(() => {
    const secs = Array.from(document.querySelectorAll('[data-block="product"]'));
    return secs.map((s, i) => {
      const t = (sel) => { const e = s.querySelector(sel); return e ? (e.textContent || '').trim() : null; };
      return {
        i,
        blockId: s.getAttribute('data-puck-component-id'),
        title: t('[data-product-info] h1'),
        price: t('[data-product-price-current]'),
        chips: s.querySelectorAll('[data-variant-chip]').length,
        addBtn: !!s.querySelector('[data-product-action="add-to-cart"]'),
        hasHero: !!s.querySelector('[data-product-hero-image]'),
        heroLoaded: (() => { const im = s.querySelector('[data-product-hero-image]'); return im ? im.getAttribute('src')?.slice(-40) : null; })(),
      };
    });
  });
  // Тест интерактива на ПЕРВОЙ Product-секции: клик варианта → цена, add-to-cart → корзина
  const test = await page.evaluate(() => {
    const s = document.querySelector('[data-block="product"]');
    if (!s) return { err: 'no product section' };
    const before = (s.querySelector('[data-product-price-current]')?.textContent || '').trim();
    const chip = Array.from(s.querySelectorAll('[data-variant-chip]')).find((c) => c.getAttribute('data-variant-active') !== 'true');
    if (chip) { chip.scrollIntoView({ block: 'center' }); chip.click(); }
    return { clickedChip: chip ? chip.getAttribute('data-variant-value') : null, priceBefore: before };
  });
  await page.waitForTimeout(700);
  test.priceAfter = await page.evaluate(() => (document.querySelector('[data-block="product"] [data-product-price-current]')?.textContent || '').trim());
  // add-to-cart
  await page.evaluate(() => { const b = document.querySelector('[data-block="product"] [data-product-action="add-to-cart"]'); if (b) b.click(); });
  await page.waitForTimeout(1500);
  test.cart = await page.evaluate(() => {
    const keys = Object.keys(localStorage).filter((k) => /cart/i.test(k));
    let lines = 0; const dump = {};
    for (const k of keys) { try { const v = JSON.parse(localStorage.getItem(k)); dump[k] = v; lines += Array.isArray(v) ? v.length : 0; } catch {} }
    return { keys, lines, sample: JSON.stringify(dump).slice(0, 300) };
  });
  res.interactTest = test;
  res.jsErrors = jserr;
  await page.screenshot({ path: '/tmp/home-product.png', fullPage: false });
  res.ok = true;
} catch (e) { res.ok = false; res.error = String(e).slice(0, 200); res.jsErrors = jserr; }
console.log(JSON.stringify(res, null, 1));
await browser.close();
