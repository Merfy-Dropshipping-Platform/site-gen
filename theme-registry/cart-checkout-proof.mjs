#!/usr/bin/env node
// Волна 3: каталог → nt-cart (flux:cart:v1) → /cart + /checkout через
// cartStore.setLocalItems. Как у Rose: два готовых стора, без нового стора
// и без CHECKOUT_UNIFIED.
//
//   node theme-registry/cart-checkout-proof.mjs
//
// Exit 0 = зелёные. Exit 1 = красные.
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
  console.log(`корзина-чекаут  ${LIVE}/catalog`);

  const cat = await page.goto(`${LIVE}/catalog`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (!cat || cat.status() !== 200) bad('catalog 200', String(cat && cat.status()));
  else ok('catalog 200');

  await page.locator('[data-nt="catalog-grid"] li[data-product-id]').first().waitFor({ state: 'attached', timeout: 25000 });
  await page.waitForTimeout(1200);

  await page.evaluate((key) => localStorage.removeItem(key), CART_KEY);

  const btn = page.locator('button[data-quick-add-id]').locator('visible=true').first();
  await btn.waitFor({ state: 'visible', timeout: 15000 });
  const added = await btn.evaluate((el) => ({
    id: el.getAttribute('data-quick-add-id') || '',
    name: (el.getAttribute('data-name') || el.textContent || '').replace(/\s+/g, ' ').trim(),
  }));
  if (!added.id) bad('кнопка quick-add', 'нет data-quick-add-id');
  else ok('кнопка quick-add', `id=${added.id.slice(0, 8)}… «${added.name.slice(0, 40)}»`);

  await btn.click({ timeout: 8000 });
  await page.waitForTimeout(800);

  const lines = await page.evaluate((key) => {
    try {
      const raw = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }, CART_KEY);
  if (!lines.length) bad('nt-cart flux:cart:v1', 'пусто после клика');
  else ok('nt-cart flux:cart:v1', `${lines.length} шт, «${String(lines[0].name || '').slice(0, 40)}»`);

  const productName = String(lines[0]?.name || added.name || '').trim();

  const badge = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[data-cart-count]')].find((e) => e.getBoundingClientRect().width > 0);
    return el ? el.textContent.trim() : null;
  });
  const badgeN = Number(badge);
  if (!badgeN || badgeN < 1) bad('бейдж [data-cart-count]', String(badge));
  else ok('бейдж [data-cart-count]', badge);

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('flux:cart:open')));
  await page.waitForTimeout(400);
  const drawer = await page.evaluate((name) => {
    const root = document.querySelector('[data-nt="cart-drawer"]');
    const items = document.querySelector('[data-cart-items]');
    const text = (items?.innerText || '').replace(/\s+/g, ' ').trim();
    return {
      state: root?.getAttribute('data-state') || '',
      hidden: items?.classList.contains('hidden') ?? null,
      hasName: name ? text.includes(name) : text.length > 3,
      text: text.slice(0, 80),
    };
  }, productName);
  if (drawer.state !== 'open') bad('дровер открыт', `state=${drawer.state}`);
  else ok('дровер открыт', drawer.state);
  if (!drawer.hasName) bad('дровер строка', drawer.text || 'пусто');
  else ok('дровер строка', `«${drawer.text.slice(0, 40)}»`);

  const cartResp = await page.goto(`${LIVE}/cart`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (!cartResp || cartResp.status() !== 200) bad('cart 200', String(cartResp && cartResp.status()));
  else ok('cart 200');
  await page.waitForTimeout(1500);

  const cartUi = await page.evaluate((name) => {
    const empty = document.querySelector('#cart-page-empty');
    const content = document.querySelector('#cart-page-content');
    const emptyVisible = !!(empty && empty.offsetParent !== null && getComputedStyle(empty).display !== 'none');
    const contentVisible = !!(content && content.offsetParent !== null && getComputedStyle(content).display !== 'none');
    const text = (content?.innerText || document.body.innerText || '').replace(/\s+/g, ' ');
    const stillNt = (() => {
      try {
        const raw = JSON.parse(localStorage.getItem('flux:cart:v1') || '[]');
        return Array.isArray(raw) ? raw.length : 0;
      } catch {
        return 0;
      }
    })();
    const storeN = window.cartStore && typeof window.cartStore.getItems === 'function' ? window.cartStore.getItems().length : -1;
    return {
      emptyVisible,
      contentVisible,
      hasName: name ? text.includes(name) : false,
      stillNt,
      storeN,
      snippet: text.slice(0, 120),
    };
  }, productName);
  if (cartUi.stillNt < 1) bad('/cart nt-cart жив', `строк=${cartUi.stillNt}`);
  else ok('/cart nt-cart жив', `${cartUi.stillNt} шт`);
  if (cartUi.emptyVisible && !cartUi.contentVisible) bad('/cart строки', `пустое состояние; store=${cartUi.storeN}; «${cartUi.snippet}»`);
  else if (!cartUi.hasName && !cartUi.contentVisible) bad('/cart строки', `store=${cartUi.storeN} «${cartUi.snippet}»`);
  else ok('/cart строки', `store=${cartUi.storeN} «${productName.slice(0, 40)}»`);

  const chk = await page.goto(`${LIVE}/checkout`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (!chk || chk.status() !== 200) bad('checkout 200', String(chk && chk.status()));
  else ok('checkout 200');
  await page.waitForTimeout(1800);

  const checkoutUi = await page.evaluate((name) => {
    const empty = document.querySelector('[data-checkout-empty]');
    const items = document.querySelector('[data-checkout-items]');
    const emptyShown = !!(empty && !empty.hidden && empty.offsetParent !== null);
    const itemsShown = !!(items && !items.hidden);
    const text = ((items && items.innerText) || '').replace(/\s+/g, ' ').trim();
    const bodyHit = name ? document.body.innerText.includes(name) : false;
    const storeN = window.cartStore && typeof window.cartStore.getItems === 'function' ? window.cartStore.getItems().length : -1;
    const htmlHasBridge = /hydrateCheckoutFromNtCart|setLocalItems/.test(document.documentElement.innerHTML);
    return {
      emptyShown,
      itemsShown,
      hasName: name ? text.includes(name) || bodyHit : itemsShown,
      text: text.slice(0, 80),
      storeN,
      htmlHasBridge,
      emptyText: (empty?.innerText || '').replace(/\s+/g, ' ').trim(),
    };
  }, productName);
  if (!checkoutUi.htmlHasBridge) bad('чекаут мост setLocalItems', 'в HTML нет hydrateCheckoutFromNtCart/setLocalItems');
  else ok('чекаут мост setLocalItems');
  if (checkoutUi.emptyShown && !checkoutUi.itemsShown) {
    bad('чекаут сводка', `«${checkoutUi.emptyText || 'Ничего не выбрано'}»; store=${checkoutUi.storeN}`);
  } else if (!checkoutUi.hasName && !checkoutUi.itemsShown) {
    bad('чекаут сводка', `store=${checkoutUi.storeN} «${checkoutUi.text}»`);
  } else ok('чекаут сводка', `store=${checkoutUi.storeN} «${(checkoutUi.text || productName).slice(0, 40)}»`);

  await page.screenshot({ path: '/tmp/cart-checkout-proof.png', fullPage: true });
  console.log('screenshot /tmp/cart-checkout-proof.png');
} catch (e) {
  bad('runner', e.stack || e.message);
} finally {
  await browser.close();
}

console.log(fail.length ? `\nКРАСНЫХ: ${fail.length}` : '\nвсе зелёные');
process.exit(fail.length ? 1 : 0);
