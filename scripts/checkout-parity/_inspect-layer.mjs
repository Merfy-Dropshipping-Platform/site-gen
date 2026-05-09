import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
await page.goto('https://8bb11302e214.merfy.ru/checkout?_=' + Date.now(), { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);
const r = await page.evaluate(() => {
  const out = [];
  for (const ss of document.styleSheets) {
    try {
      for (let i = 0; i < ss.cssRules.length; i++) {
        const r = ss.cssRules[i];
        if (r.constructor.name === 'CSSLayerBlockRule' || r.cssRules) {
          // recursive search for button bg
          const search = (rule, layerName='') => {
            const matches = [];
            const rs = rule.cssRules || [];
            for (const ir of rs) {
              if (ir.selectorText && ir.style && ir.style.backgroundColor) {
                if (ir.selectorText.includes('button') || ir.selectorText.includes('color-button-bg')) {
                  matches.push({ layer: layerName || (rule.name || rule.constructor.name), sel: ir.selectorText, bg: ir.style.backgroundColor });
                }
              }
              if (ir.cssRules) {
                matches.push(...search(ir, ir.name || rule.name || layerName));
              }
            }
            return matches;
          };
          out.push(...search(r, r.name));
        }
      }
    } catch {}
  }
  return out;
});
console.log(JSON.stringify(r, null, 2));
await browser.close();
