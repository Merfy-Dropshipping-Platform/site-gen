import { chromium } from 'playwright';
const URL = process.argv[2] || 'https://1dw339dxomuy.merfy.ru/product/testing';
const browser = await chromium.launch({ headless: true, args: ['--disable-http2', '--disable-quic'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const res = { url: URL };
const grab = () => page.evaluate(() => {
  const s = document.querySelector('[data-block="product"]');
  if (!s) return { err: 'no section' };
  const hero = s.querySelector('[data-product-hero-image]');
  const thumbs = Array.from(s.querySelectorAll('[data-product-thumb]'));
  return {
    layout: (s.querySelector('[data-gallery-layout]')?.getAttribute('data-gallery-layout')) || '?',
    heroSrc: hero ? (hero.getAttribute('src') || '').slice(-44) : 'NO-HERO',
    heroVisible: hero ? (hero.getBoundingClientRect().width > 10 && getComputedStyle(hero).display !== 'none') : false,
    thumbCount: thumbs.length,
    thumbSrcs: thumbs.slice(0, 4).map((t) => { const im = t.querySelector('img'); return im ? (im.getAttribute('src') || 'EMPTY').slice(-30) : 'NO-IMG'; }),
  };
});
try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => { const e = document.querySelector('[data-product-hero-image]'); return e && (e.getAttribute('src') || '').length > 5; }, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  res.before = await grab();
  await page.screenshot({ path: '/tmp/gal-1-before.png' });

  // клик по 2-й миниатюре
  res.clicked = await page.evaluate(() => {
    const s = document.querySelector('[data-block="product"]');
    const thumbs = Array.from(s.querySelectorAll('[data-product-thumb]'));
    const t = thumbs[1] || thumbs[0];
    if (!t) return 'no-thumb';
    t.scrollIntoView({ block: 'center' });
    const im = t.querySelector('img');
    const src = im ? (im.getAttribute('src') || '') : '';
    t.click();
    return { clickedThumbSrc: src.slice(-30) };
  });
  await page.waitForTimeout(900);
  res.after = await grab();
  await page.screenshot({ path: '/tmp/gal-2-after.png' });
  res.ok = true;
} catch (e) { res.ok = false; res.error = String(e).slice(0, 200); }
console.log(JSON.stringify(res, null, 1));
await browser.close();
