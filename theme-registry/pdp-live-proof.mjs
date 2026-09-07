#!/usr/bin/env node
// Волна PDP, локально: каталог → карточка → товар → nt-cart → «Купить сейчас» → чекаут.
// Как у Rose: add + /checkout через готовые сторы, без прода.
//
//   node theme-registry/pdp-live-proof.mjs
import { chromium } from 'playwright';

const LIVE = 'http://127.0.0.1:8099';
const CART_KEY = 'flux:cart:v1';
const fail = [];
const ok = (n, d = '') => console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`);
const bad = (n, d) => {
  fail.push(`${n}: ${d}`);
  console.log(`  ✗ ${n} — ${d}`);
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU' });
const page = await ctx.newPage();

try {
  console.log(`pdp-live  ${LIVE}`);

  const cat = await page.goto(`${LIVE}/catalog`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (!cat || cat.status() !== 200) bad('catalog 200', String(cat && cat.status()));
  else ok('catalog 200');
  await page.locator('[data-nt="catalog-grid"] li[data-product-id]').first().waitFor({ state: 'attached', timeout: 25000 });
  await page.waitForTimeout(1000);

  const card = page.locator('[data-nt="catalog-grid"] li[data-product-id]').locator('visible=true').first();
  const href = await card.locator('a[href*="product"]').first().getAttribute('href');
  const cardName = ((await card.locator('[data-nt="flux-product-card"], article, a').first().getAttribute('aria-label')) || '').replace(/\s+/g, ' ').trim();
  if (!href || !/product/.test(href)) bad('ссылка карточки', String(href));
  else ok('ссылка карточки', href);

  await card.locator('a[href*="product"]').first().click({ timeout: 8000 });
  await page.waitForURL(/product/, { timeout: 15000 });
  await page.waitForTimeout(1500);
  const pdpUrl = page.url();
  ok('открылся PDP', pdpUrl.replace(LIVE, ''));

  const pdpName = await page.evaluate(() => {
    const h = document.querySelector('[data-pdp-title], [data-cfg-title], h1, h2');
    return (h?.textContent || document.title || '').replace(/\s+/g, ' ').trim();
  });
  if (!pdpName || /^(Товар|Flux)/i.test(pdpName)) bad('имя товара', pdpName);
  else ok('имя товара', pdpName.slice(0, 48));

  const add = page.locator('main [data-add-to-cart]').locator('visible=true').first();
  await add.waitFor({ state: 'visible', timeout: 10000 });
  ok('кнопка в корзину');

  await page.evaluate((k) => localStorage.removeItem(k), CART_KEY);
  await add.click({ timeout: 8000 });
  await page.waitForTimeout(800);
  const afterAdd = await page.evaluate((k) => {
    try {
      const raw = JSON.parse(localStorage.getItem(k) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }, CART_KEY);
  if (!afterAdd.length) bad('PDP add → nt-cart', 'пусто');
  else ok('PDP add → nt-cart', `${afterAdd.length} шт «${String(afterAdd[0].name || '').slice(0, 36)}»`);

  await page.keyboard.press('Escape').catch(() => {});
  await page.locator('[data-cart-close]').first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(400);

  const variants = page.locator('[data-variant-value]').locator('visible=true');
  const vCount = await variants.count();
  if (vCount < 2) {
    ok('варианты', 'меньше двух видимых — пропуск смены фото');
  } else {
    const img = page.locator('[data-pdp-main], [data-cfg-main], main img').first();
    const src0 = await img.getAttribute('src');
    const target = page.locator('[data-variant-value]:not([aria-checked="true"]):not([aria-pressed="true"])').locator('visible=true').first();
    const nOther = await target.count();
    if (!nOther) ok('фото варианта', 'нет второго значения');
    else {
      await target.click({ timeout: 8000 });
      await page.waitForTimeout(500);
      const src1 = await img.getAttribute('src');
      if (!src0) bad('фото варианта', 'нет src');
      else if (src0 === src1) ok('фото варианта', `src тот же — у опции может не быть своего фото`);
      else ok('фото варианта сменилось', `${String(src0).slice(-24)} → ${String(src1).slice(-24)}`);
    }
  }

  await page.evaluate((k) => localStorage.removeItem(k), CART_KEY);
  try { await page.evaluate(() => sessionStorage.removeItem('flux:buynow')); } catch {}
  const buy = page.locator('main [data-action="buy-now"], main [data-cfg-buy]').locator('visible=true').first();
  await buy.waitFor({ state: 'visible', timeout: 8000 });
  await buy.click({ timeout: 8000 });
  await page.waitForURL(/checkout/, { timeout: 15000 }).catch(() => {});
  const afterBuy = page.url();
  if (!/checkout/.test(afterBuy)) bad('купить сейчас → /checkout', afterBuy);
  else ok('купить сейчас → /checkout', afterBuy.replace(LIVE, ''));
  await page.waitForTimeout(1800);

  const ntAfterBuy = await page.evaluate((k) => {
    try {
      const raw = JSON.parse(localStorage.getItem(k) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }, CART_KEY);
  const chk = await page.evaluate(() => {
    const empty = document.querySelector('[data-checkout-empty]');
    const items = document.querySelector('[data-checkout-items]');
    const emptyShown = !!(empty && !empty.hidden && empty.offsetParent !== null);
    const itemsShown = !!(items && !items.hidden);
    const text = ((items && items.innerText) || document.body.innerText || '').replace(/\s+/g, ' ').trim();
    const storeN = window.cartStore && window.cartStore.getItems ? window.cartStore.getItems().length : -1;
    return { emptyShown, itemsShown, text: text.slice(0, 120), storeN };
  });
  if (ntAfterBuy.length < 1) bad('buy-now пишет nt-cart', 'пусто (express buynow чекаут выкидывает)');
  else ok('buy-now пишет nt-cart', `${ntAfterBuy.length} шт`);
  if (chk.emptyShown && !chk.itemsShown) bad('чекаут сводка после buy-now', `пусто store=${chk.storeN} «${chk.text.slice(0, 60)}»`);
  else ok('чекаут сводка после buy-now', `store=${chk.storeN} «${chk.text.slice(0, 50)}»`);

  const slugProd = 'conferencespeaker-hub';
  const slugResp = await page.goto(`${LIVE}/product/${slugProd}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(1200);
  const slugTitle = ((await page.title()) || '').trim();
  const slugH = await page.evaluate(() => (document.querySelector('[data-pdp-title], [data-cfg-title], h1, h2')?.textContent || '').replace(/\s+/g, ' ').trim());
  if (!slugResp || slugResp.status() !== 200) bad('/product/:slug 200', String(slugResp && slugResp.status()));
  else ok('/product/:slug 200');
  if (/ConferenceSpeaker|Hub/i.test(slugTitle + ' ' + slugH)) ok('/product/:slug имя', slugH || slugTitle);
  else bad('/product/:slug имя', `${slugTitle} / ${slugH}`);

  await page.screenshot({ path: '/tmp/pdp-live-proof.png', fullPage: true });
  console.log('screenshot /tmp/pdp-live-proof.png');
} catch (e) {
  bad('runner', e.stack || e.message);
} finally {
  await browser.close();
}

console.log(fail.length ? `\nКРАСНЫХ: ${fail.length}` : '\nвсе зелёные');
process.exit(fail.length ? 1 : 0);
