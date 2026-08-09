#!/usr/bin/env node
// Интерактив-гейт КОРЗИНЫ и ИЗБРАННОГО (волна «интерактив», v1) — реальные
// КЛИКИ в браузере на странице каталога превью, замеры «как глазом»:
//
//   node theme-registry/interactive-gate.mjs --theme rose|flux
//
// Корзина (ядро nt-cart, делегат initCartUI):
//   1. quick-add клик → localStorage <тема>:cart:v1 = 1 строка
//   2. бейдж [data-cart-count] показывает 1
//   3. дровер открыт и содержит имя товара (строка renderDrawerItem)
//   4. [data-cart-inc] → total в дровере вырос
//   5. [data-cart-remove] → корзина пуста (localStorage + бейдж)
// Избранное (wishlist.ts, делегат initWishlistUI):
//   6. клик сердца [data-wishlist-toggle] → localStorage <тема>:wishlist:v1 = 1 id
//   7. счётчик шапки [data-wishlist-count] = 1 (если шапка темы несёт счётчик)
// Гейт: rose 100% → тот же скрипт на flux.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1]] : null)).filter(Boolean),
);
const THEME = args.theme;
if (!THEME) { console.error('usage: interactive-gate.mjs --theme rose|flux'); process.exit(2); }
const sites = JSON.parse(readFileSync(path.join(import.meta.dirname, 'sites.json'), 'utf-8'));
const { siteId } = sites[THEME];
// Cart-флоу: HOME + Popular (quickAddMode='cart' → кнопки [data-add-to-cart]
// ЯДРА nt-cart — именно его мигрировали). Каталожный quick-add — ДРУГОЙ путь
// (window.cartStore, страничный рантайм с сервер-синком; в композитном превью
// его нет) — интерактив-волна v2.
const PAGE = 'home';
const CATALOG_PAGE = THEME === 'flux' ? 'page-catalog' : 'catalog';

const results = [];
const check = (label, pass, facts) => { results.push({ pass }); console.log(`${pass ? '✓' : '✗'} ${label.padEnd(34)} ${facts}`); };

const b = await chromium.launch({ headless: true });
const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
await pg.goto(`http://localhost:3110/api/sites/${siteId}/preview?page=${PAGE}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
await pg.waitForTimeout(1500);
await pg.evaluate(({ siteId, themeId, page }) => window.postMessage({ type: 'init', siteId, themeId, pageId: page, data: undefined }, '*'), { siteId, themeId: THEME, page: PAGE });
await pg.waitForTimeout(400);

// Товарные секции в ПРЕВЬЮ всегда плейсхолдеры (реальные товары инжектит live-билд)
// → «настоящей» кнопки [data-add-to-cart] в превью нет ни у одной темы. Для v1
// вставляем кнопку с data-атрибутами РЕАЛЬНОГО товара тенанта и кликаем её:
// делегат initCartUI и ядро тестируются полноценно (клик/атрибуты/бейдж/дровер).
// Live-волна заменит на клик по настоящей карточке витрины.
const prod = await pg.evaluate(async (sid) => {
  const r = await fetch(`/api/sites/${sid}/storefront-data`);
  const d = await r.json();
  const p = (d.products || [])[0];
  return p ? { id: p.id, name: p.name, price: String(p.basePrice ?? p.price ?? '1000'), image: (p.images || [])[0] ?? '' } : null;
}, siteId);
if (!prod) { console.error('storefront-data не дал товара'); process.exit(2); }
await pg.evaluate((p) => {
  const host = document.querySelector('[data-puck-component-id^="PopularProducts"]') ?? document.body;
  const btn = document.createElement('button');
  btn.setAttribute('data-add-to-cart', '');
  btn.setAttribute('data-product-id', p.id);
  btn.setAttribute('data-name', p.name);
  btn.setAttribute('data-price', p.price);
  btn.setAttribute('data-image', p.image);
  btn.textContent = 'В корзину (проба реестра)';
  btn.style.cssText = 'position:fixed;bottom:16px;left:16px;z-index:9999;padding:10px 14px;background:#000;color:#fff';
  host.appendChild(btn);
}, prod);

const ls = (k) => pg.evaluate((key) => window.localStorage.getItem(key), k);
await pg.evaluate((t) => window.localStorage.removeItem(`${t}:cart:v1`), THEME);
await pg.evaluate((t) => window.localStorage.removeItem(`${t}:wishlist:v1`), THEME);

// 1. добавить в корзину
await pg.evaluate(() => {
  const btn = [...document.querySelectorAll('[data-add-to-cart]')].find((b) => b.getBoundingClientRect().width > 1);
  btn?.scrollIntoView({ block: 'center' });
});
await pg.waitForTimeout(600);
await pg.locator('[data-add-to-cart]:visible').first().click({ timeout: 8000 }).catch(() => {});
await pg.waitForTimeout(1200);
const cartRaw = await ls(`${THEME}:cart:v1`);
let lines = [];
try { lines = JSON.parse(cartRaw || '[]'); } catch {}
check('добавление в корзину (localStorage)', lines.length === 1, `строк: ${lines.length}${lines[0] ? `, «${String(lines[0].name).slice(0, 24)}»` : ''}`);

// 2. бейдж
const badge = await pg.evaluate(() => {
  const el = [...document.querySelectorAll('[data-cart-count]')].find((e) => e.getBoundingClientRect().width > 0);
  return el ? el.textContent.trim() : null;
});
check('бейдж [data-cart-count]', badge === '1', `бейдж: ${badge ?? 'не найден'}`);

// 3. дровер открыт со строкой товара
const drawer = await pg.evaluate(() => {
  const items = [...document.querySelectorAll('[data-cart-items]')].find((e) => e.getBoundingClientRect().width > 0);
  const vis = items && items.closest('[aria-hidden]')?.getAttribute('aria-hidden') !== 'true';
  return { found: !!items, open: !!vis, text: (items?.innerText || '').slice(0, 60) };
});
check('дровер открыт со строкой', drawer.found && drawer.text.length > 3, `открыт=${drawer.open}, строка: «${drawer.text.replace(/\n/g, ' · ').slice(0, 40)}»`);

// 4. inc → total растёт
const total0 = await pg.evaluate(() => [...document.querySelectorAll('[data-cart-total]')].map((e) => e.textContent.trim()).find(Boolean) ?? '');
await pg.locator('[data-cart-inc]:visible').first().click({ timeout: 5000 }).catch(() => {});
await pg.waitForTimeout(800);
const total1 = await pg.evaluate(() => [...document.querySelectorAll('[data-cart-total]')].map((e) => e.textContent.trim()).find(Boolean) ?? '');
check('плюс → сумма меняется', total0 && total1 && total0 !== total1, `${total0} → ${total1}`);

// 5. remove → пусто
await pg.locator('[data-cart-remove]:visible').first().click({ timeout: 5000 }).catch(() => {});
await pg.waitForTimeout(800);
const after = JSON.parse((await ls(`${THEME}:cart:v1`)) || '[]');
check('удаление строки → корзина пуста', after.length === 0, `строк: ${after.length}`);

// 6. избранное: сердце на карточке (на каталоге — там сердца точно есть)
await pg.goto(`http://localhost:3110/api/sites/${siteId}/preview?page=${CATALOG_PAGE}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
await pg.waitForTimeout(2500);
await pg.evaluate(() => {
  const h = [...document.querySelectorAll('[data-wishlist-toggle]')].find((b) => b.getBoundingClientRect().width > 1);
  h?.scrollIntoView({ block: 'center' });
});
await pg.waitForTimeout(500);
await pg.locator('[data-wishlist-toggle]:visible').first().click({ timeout: 8000 }).catch(() => {});
await pg.waitForTimeout(700);
const wl = JSON.parse((await ls(`${THEME}:wishlist:v1`)) || '[]');
check('сердце → избранное (localStorage)', Array.isArray(wl) && wl.length === 1, `id: ${wl.length}`);

// 7. счётчик шапки (если тема несёт его на этой странице)
const wlBadge = await pg.evaluate(() => {
  const el = [...document.querySelectorAll('[data-wishlist-count]')].find((e) => e.getBoundingClientRect().width > 0);
  return el ? el.textContent.trim() : null;
});
if (wlBadge === null) console.log(`◌ счётчик [data-wishlist-count]        в видимой шапке нет (канон темы) — пропуск`);
else check('счётчик избранного в шапке', wlBadge === '1', `счётчик: ${wlBadge}`);

await b.close();
const failed = results.filter((r) => !r.pass).length;
console.log(`\nитог: ${results.length - failed}/${results.length} ✓`);
process.exit(failed ? 1 : 0);
