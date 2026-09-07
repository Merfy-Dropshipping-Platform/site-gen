#!/usr/bin/env node
// Волна 2: витрина :8099 ходит в локальный API, не в gateway.merfy.ru.
//
//   node theme-registry/catalog-live-api-proof.mjs
//
// Exit 0 = зелёные. Exit 1 = красные.
import { chromium } from 'playwright';

const LIVE = 'http://127.0.0.1:8099/catalog';
const SITE = '132d3a3e-a28f-40b7-98fa-a0200151cfb8';
const fail = [];
const ok = (n, d = '') => console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`);
const bad = (n, d) => {
  fail.push(`${n}: ${d}`);
  console.log(`  ✗ ${n} — ${d}`);
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU' });
const page = await ctx.newPage();
const storeReqs = [];
page.on('request', (req) => {
  const u = req.url();
  if (u.includes('/api/store/products') || u.includes('/api/store/filters') || u.includes('/api/store/collections')) {
    storeReqs.push(u);
  }
});

try {
  console.log(`витрина-API  ${LIVE}`);
  const resp = await page.goto(LIVE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (!resp || resp.status() !== 200) bad('catalog 200', String(resp && resp.status()));
  else ok('catalog 200');

  const apiBase = await page.evaluate(() => window.__MERFY_API_BASE__ || '');
  if (!apiBase) bad('__MERFY_API_BASE__', 'пусто');
  else if (/gateway\.merfy\.ru/i.test(apiBase)) bad('__MERFY_API_BASE__', apiBase);
  else if (!/8099/.test(apiBase) && apiBase !== 'http://127.0.0.1:8099' && !String(apiBase).includes('localhost:8099')) {
    // location.origin на 127.0.0.1:8099
    if (apiBase === 'http://127.0.0.1:8099' || apiBase === 'http://localhost:8099') ok('__MERFY_API_BASE__', apiBase);
    else bad('__MERFY_API_BASE__', apiBase);
  } else ok('__MERFY_API_BASE__', apiBase);

  await page.locator('[data-nt="catalog-grid"] li[data-product-id]').first().waitFor({ state: 'attached', timeout: 25000 });
  await page.waitForTimeout(1000);

  const prodUrls = storeReqs.filter((u) => u.includes('/api/store/products'));
  const toProd = prodUrls.filter((u) => /gateway\.merfy\.ru/i.test(u));
  const toLocal = prodUrls.filter((u) => /127\.0\.0\.1:8099|localhost:8099/.test(u));
  if (toProd.length) bad('products не на прод', toProd[0]);
  else if (!toLocal.length) bad('products на :8099', prodUrls.join('\n') || 'нет запроса');
  else ok('products на :8099', toLocal[0].replace(/\?.*$/, '?…'));

  const names = await page.locator('[data-nt="catalog-grid"] li[data-product-id]').locator('visible=true').evaluateAll((lis) =>
    lis.map((li) => {
      const card = li.querySelector('[data-nt="flux-product-card"], article, a');
      return (card?.getAttribute('aria-label') || li.textContent || '').replace(/\s+/g, ' ').trim();
    }),
  );
  if (names.some((n) => /Смартфон 59/.test(n)) && names.filter((n) => /Смартфон 59/.test(n)).length >= 4) {
    bad('живые карточки', names.slice(0, 3).join(' | '));
  } else if (names.length < 4) bad('живые карточки', `n=${names.length} ${names[0] || ''}`);
  else ok('живые карточки', `${names.length} шт, «${names[0].slice(0, 40)}»`);

  // proxy sanity: same-origin JSON
  const json = await page.evaluate(async (siteId) => {
    const r = await fetch(`/api/store/products?store_id=${siteId}&page=1&limit=2`);
    return { status: r.status, body: await r.json() };
  }, SITE);
  if (json.status !== 200) bad('same-origin JSON', String(json.status));
  else if (typeof json.body?.total !== 'number' || json.body.total < 8) {
    bad('same-origin total', JSON.stringify({ total: json.body?.total, keys: json.body && Object.keys(json.body) }));
  } else ok('same-origin total', String(json.body.total));

  await page.screenshot({ path: '/tmp/catalog-live-api-proof.png', fullPage: true });
  console.log('screenshot /tmp/catalog-live-api-proof.png');
} catch (e) {
  bad('runner', e.stack || e.message);
} finally {
  await browser.close();
}

console.log(fail.length ? `\nКРАСНЫХ: ${fail.length}` : '\nвсе зелёные');
process.exit(fail.length ? 1 : 0);
