#!/usr/bin/env node
// Эмпирика: как рендерятся layout/variants.displayStyle/variants.shape (обе темы).
import { chromium } from 'playwright';
const THEME = process.argv[2] || 'rose';
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
async function set(props) {
  await pg.evaluate(({ blockId, props }) => window.postMessage({ type: 'update-block', pageId: 'product', blockId, props: { id: blockId, ...props } }, '*'), { blockId, props });
  await pg.waitForTimeout(2200);
}
async function metrics() {
  return pg.evaluate(() => {
    const vis = (e) => e.getBoundingClientRect().width > 1 && e.getBoundingClientRect().height > 1;
    const bigImgs = [...document.querySelectorAll('main img')].filter((i) => vis(i) && i.getBoundingClientRect().width > 280).length;
    const galleryAttr = document.querySelector('[data-gallery-layout]')?.getAttribute('data-gallery-layout') ?? null;
    const chip = [...document.querySelectorAll('main button, main label, main li, main [role="radio"]')].find((e) => vis(e) && /Чёрный/.test(e.textContent));
    const sel = [...document.querySelectorAll('main select')].filter(vis).length;
    const cs = chip ? getComputedStyle(chip) : null;
    return { bigImgs, galleryAttr, sel, chipTag: chip?.tagName ?? null, chipRadius: cs?.borderRadius ?? null, chipVisible: !!chip };
  });
}
const pid = PID[THEME];
for (const layout of ['stacked', 'two-columns', 'carousel', 'split']) {
  await set({ productId: pid, layout });
  console.log(`layout=${layout}:`, JSON.stringify(await metrics()));
}
for (const ds of ['button', 'list']) {
  await set({ productId: pid, layout: 'carousel', variants: { displayStyle: ds } });
  console.log(`displayStyle=${ds}:`, JSON.stringify(await metrics()));
}
for (const sh of ['circle', 'square', 'none']) {
  await set({ productId: pid, layout: 'carousel', variants: { displayStyle: 'button', shape: sh } });
  console.log(`shape=${sh}:`, JSON.stringify(await metrics()));
}
await b.close();
