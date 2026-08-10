#!/usr/bin/env node
// Пруф конфигуратора: update-block productId → вариант-товар (свотчи/чипы/цены).
import { chromium } from 'playwright';
const THEME = process.argv[2] || 'flux';
const SITES = { flux: '132d3a3e-a28f-40b7-98fa-a0200151cfb8', rose: 'e03dd420-febf-4499-9fc4-992412cc1b99' };
const PID = { flux: '11111111-2222-4333-8444-555555550001', rose: '22222222-2222-4333-8444-555555550001' };
const siteId = SITES[THEME];
const b = await chromium.launch({ headless: true });
const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
await pg.goto(`http://localhost:3110/api/sites/${siteId}/preview?page=product`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
await pg.waitForTimeout(1800);
await pg.evaluate(({ siteId, themeId }) => window.postMessage({ type: 'init', siteId, themeId, pageId: 'product', data: undefined }, '*'), { siteId, themeId: THEME });
await pg.waitForTimeout(300);
const blockId = await pg.evaluate(() => document.querySelector('[data-puck-component-id^="Product"]')?.getAttribute('data-puck-component-id'));
console.log('blockId:', blockId);
await pg.evaluate(({ blockId, pid }) => window.postMessage({ type: 'update-block', pageId: 'product', blockId, props: { id: blockId, productId: pid } }, '*'), { blockId, pid: PID[THEME] });
await pg.waitForTimeout(2500);
const info = await pg.evaluate(() => {
  const t = (s) => document.body.innerText.includes(s);
  return {
    title: t('Наушники Реестр Про'),
    颜色: t('Чёрный') && t('Серебристый'),
    memory: t('128 ГБ') && t('256 ГБ'),
    oldPrice: t('15 990'),
    price: t('12 990'),
    thumbs: document.querySelectorAll('main img').length,
    swatches: document.querySelectorAll('main [data-swatch-img], main [style*="background:#000000"], main [style*="#C0C0C0"]').length,
  };
});
console.log(JSON.stringify(info));
await pg.screenshot({ path: `/tmp/pdp-${THEME}-variant.png` });
await b.close();
