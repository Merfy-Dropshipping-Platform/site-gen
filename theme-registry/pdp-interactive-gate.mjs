#!/usr/bin/env node
// Интерактив-гейт СТРАНИЦЫ ТОВАРА (PDP): реальная кнопка «Добавить в корзину»
// конфигуратора (НЕ синтетика — на PDP кнопка есть всегда):
//   node theme-registry/pdp-interactive-gate.mjs --theme rose|flux
// 1. клик главной [data-add-to-cart] → localStorage <t>:cart:v1 = 1 строка
// 2. бейдж [data-cart-count] = 1
// 3. дровер открыт со строкой товара
// 4. степпер PDP (если есть) → повторный клик добавляет количество
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1]] : null)).filter(Boolean),
);
const THEME = args.theme;
if (!THEME) { console.error('usage: pdp-interactive-gate.mjs --theme rose|flux'); process.exit(2); }
const sites = JSON.parse(readFileSync(path.join(import.meta.dirname, 'sites.json'), 'utf-8'));
const { siteId } = sites[THEME];

const results = [];
const check = (label, pass, facts) => { results.push({ pass }); console.log(`${pass ? '✓' : '✗'} ${label.padEnd(34)} ${facts}`); };

const b = await chromium.launch({ headless: true });
const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
await pg.goto(`http://localhost:3110/api/sites/${siteId}/preview?page=product`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
await pg.waitForTimeout(2000);
await pg.evaluate((t) => window.localStorage.removeItem(`${t}:cart:v1`), THEME);

// 1. главная кнопка PDP (первая видимая data-add-to-cart в main — конфигуратор,
// НЕ quick-add карточек рекомендаций ниже)
await pg.evaluate(() => {
  const btn = [...document.querySelectorAll('main [data-add-to-cart]')].find((e) => e.getBoundingClientRect().width > 1);
  btn?.scrollIntoView({ block: 'center' });
});
await pg.waitForTimeout(500);
await pg.locator('main [data-add-to-cart]:visible').first().click({ timeout: 8000 }).catch(() => {});
await pg.waitForTimeout(1200);
const ls = (k) => pg.evaluate((key) => window.localStorage.getItem(key), k);
let lines = [];
try { lines = JSON.parse((await ls(`${THEME}:cart:v1`)) || '[]'); } catch {}
check('PDP-кнопка → корзина (localStorage)', lines.length === 1, `строк: ${lines.length}${lines[0] ? `, «${String(lines[0].name).slice(0, 28)}», ${lines[0].price}₽` : ''}`);

// 2. бейдж
const badge = await pg.evaluate(() => {
  const el = [...document.querySelectorAll('[data-cart-count]')].find((e) => e.getBoundingClientRect().width > 0);
  return el ? el.textContent.trim() : null;
});
check('бейдж [data-cart-count]', badge === '1', `бейдж: ${badge ?? 'не найден'}`);

// 3. дровер открыт со строкой товара
const drawer = await pg.evaluate(() => {
  const items = [...document.querySelectorAll('[data-cart-items]')].find((e) => e.getBoundingClientRect().width > 0);
  return { found: !!items, text: (items?.innerText || '').replace(/\n/g, ' · ').slice(0, 50) };
});
check('дровер открыт со строкой', drawer.found && drawer.text.length > 3, `«${drawer.text}»`);

// 4. повторный клик → quantity 2 (та же строка, не дубль)
await pg.keyboard.press('Escape').catch(() => {});
await pg.waitForTimeout(400);
await pg.locator('main [data-add-to-cart]:visible').first().click({ timeout: 8000 }).catch(() => {});
await pg.waitForTimeout(1000);
let lines2 = [];
try { lines2 = JSON.parse((await ls(`${THEME}:cart:v1`)) || '[]'); } catch {}
check('повторный клик → qty 2 (не дубль)', lines2.length === 1 && lines2[0]?.quantity === 2, `строк: ${lines2.length}, qty: ${lines2[0]?.quantity}`);

await b.close();
const failed = results.filter((r) => !r.pass).length;
console.log(`\nитог: ${results.length - failed}/${results.length} ✓`);
process.exit(failed ? 1 : 0);
