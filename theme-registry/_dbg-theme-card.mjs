#!/usr/bin/env node
// Зонд: почему cardRadius на flux-каталоге меряется 8px→8px. Повторяет шаги
// theme-gate (init → quickAdd update → подмена tokens-css) и печатает, ЧТО за
// элемент матчится селектором чека, его inline-style и computed.
import { chromium } from 'playwright';

const siteId = '132d3a3e-a28f-40b7-98fa-a0200151cfb8';
const b = await chromium.launch({ headless: true });
const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
await pg.goto(`http://localhost:3110/api/sites/${siteId}/preview?page=page-catalog`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
await pg.waitForTimeout(1500);
await pg.evaluate(({ siteId }) => window.postMessage({ type: 'init', siteId, themeId: 'flux', pageId: 'page-catalog', data: undefined }, '*'), { siteId });
await pg.waitForTimeout(300);
const blockId = await pg.evaluate(() => document.querySelector('[data-puck-component-id^="Catalog"]')?.getAttribute('data-puck-component-id'));
await pg.evaluate(({ blockId }) => window.postMessage({ type: 'update-block', pageId: 'page-catalog', blockId, props: { id: blockId, productCard: { quickAdd: 'cart' } } }, '*'), { blockId });
for (let t = 0; t < 20; t++) {
  if (await pg.evaluate(() => !!document.querySelector('[data-quick-add-id]'))) break;
  await pg.waitForTimeout(400);
}
async function setTheme(settings) {
  await pg.evaluate(async ({ siteId, settings }) => {
    const r = await fetch(`/api/sites/${siteId}/preview/tokens-css`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ themeId: 'flux', themeSettings: { templateId: 'flux', ...settings } }),
    });
    document.getElementById('__merfy_tokens_css').textContent = await r.text();
  }, { siteId, settings });
  await pg.waitForTimeout(350);
}
for (const cr of [0, 24]) {
  await setTheme({ productCardStyle: 'card', cardRadius: cr });
  const info = await pg.evaluate(() => {
    const sel = 'li[data-product-id] article, [data-nt$="product-card"]';
    const el = [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 1);
    if (!el) return { none: true, liCount: document.querySelectorAll('li[data-product-id]').length };
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName, nt: el.getAttribute('data-nt'), container: el.getAttribute('data-card-container'),
      styleAttr: el.getAttribute('style'), radius: cs.borderRadius, padTop: cs.paddingTop, bg: cs.backgroundColor,
      liCount: document.querySelectorAll('li[data-product-id]').length,
      varRadius: getComputedStyle(document.documentElement).getPropertyValue('--product-card-radius').trim(),
      varPad: getComputedStyle(document.documentElement).getPropertyValue('--product-card-padding').trim(),
    };
  });
  console.log(`cardRadius=${cr}:`, JSON.stringify(info, null, 1));
}
await b.close();
