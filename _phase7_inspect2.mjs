import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();

await page.goto('https://dde2b0280a90.merfy.ru/catalog');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);

// All hrefs (including unique ones)
const hrefs = await page.$$eval('a', els => Array.from(new Set(els.map(e => e.getAttribute('href')).filter(Boolean))));
console.log('UNIQUE hrefs:');
for (const h of hrefs) console.log('  ', h);

console.log('\n---\nArticle inner anchors:');
const artAnchors = await page.$$eval('article a', els => els.slice(0, 5).map(e => e.getAttribute('href')));
for (const h of artAnchors) console.log('  ', h);

// Look at first article more deeply
const firstArt = await page.$$eval('article', els => els.length > 0 ? els[0].outerHTML.slice(0, 500) : 'none');
console.log('\nfirst article:\n', firstArt);

await browser.close();
