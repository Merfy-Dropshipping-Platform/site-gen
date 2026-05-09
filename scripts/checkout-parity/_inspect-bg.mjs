import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
await page.goto('https://8bb11302e214.merfy.ru/checkout?_=' + Date.now(), { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);
const r = await page.evaluate(() => {
  const btn = document.querySelector('[data-checkout-slot="submit"] button');
  if (!btn) return null;
  // Compute all matching rules ordered by source
  const matches = [];
  for (const ss of document.styleSheets) {
    try {
      for (const r of ss.cssRules) {
        // CSSStyleRule
        if (r.selectorText && r.style && r.style.backgroundColor) {
          try {
            if (btn.matches(r.selectorText)) {
              matches.push({ sel: r.selectorText, bg: r.style.backgroundColor });
            }
          } catch {}
        }
        // CSSGroupingRule (e.g. @layer utilities)
        if (r.cssRules) {
          for (const ir of r.cssRules) {
            if (ir.selectorText && ir.style && ir.style.backgroundColor) {
              try {
                if (btn.matches(ir.selectorText)) {
                  matches.push({ sel: ir.selectorText, bg: ir.style.backgroundColor });
                }
              } catch {}
            }
            if (ir.cssRules) {
              for (const iir of ir.cssRules) {
                if (iir.selectorText && iir.style && iir.style.backgroundColor) {
                  try {
                    if (btn.matches(iir.selectorText)) {
                      matches.push({ sel: iir.selectorText, bg: iir.style.backgroundColor });
                    }
                  } catch {}
                }
              }
            }
          }
        }
      }
    } catch (e) { matches.push({ err: String(e) }); }
  }
  return matches;
});
console.log(JSON.stringify(r, null, 2));
await browser.close();
