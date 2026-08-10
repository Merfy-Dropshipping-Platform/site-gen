#!/usr/bin/env node
import { chromium } from 'playwright';
const siteId = '132d3a3e-a28f-40b7-98fa-a0200151cfb8';
const b = await chromium.launch({ headless: true });
const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
pg.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 120)); });
await pg.goto(`http://localhost:3110/api/sites/${siteId}/preview?page=product`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
await pg.waitForTimeout(1800);
await pg.evaluate(({ siteId }) => window.postMessage({ type: 'init', siteId, themeId: 'flux', pageId: 'product', data: undefined }, '*'), { siteId });
await pg.waitForTimeout(300);
const blockId = await pg.evaluate(() => document.querySelector('[data-puck-component-id^="Product"]')?.getAttribute('data-puck-component-id'));
const h1 = () => pg.evaluate((bid) => {
  const root = document.querySelector(`[data-puck-component-id="${bid}"]`);
  const h = root && [...root.querySelectorAll('h1,h2,h3')].find((e) => e.getBoundingClientRect().width > 1);
  return h ? h.textContent.trim().slice(0, 40) : null;
}, blockId);
console.log('старт h1:', await h1());
for (const [name, pid] of [['alt (M Headphones 2s)', '4ad208f2-0c1e-420d-8d64-9812cd83615c'], ['variant (Реестр Про)', '11111111-2222-4333-8444-555555550001'], ['alt снова', '4ad208f2-0c1e-420d-8d64-9812cd83615c']]) {
  await pg.evaluate(({ blockId, pid }) => window.postMessage({ type: 'update-block', pageId: 'product', blockId, props: { id: blockId, productId: pid } }, '*'), { blockId, pid });
  await pg.waitForTimeout(2500);
  console.log(`${name}: h1=`, await h1());
}
await b.close();
