// Take a fresh screenshot of the live catalog page after publish.
import { chromium } from 'playwright';
import fs from 'fs';

const OUT = '/tmp/catalog-fix';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    locale: 'ru-RU',
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  console.log('navigating live...');
  await page.goto('https://7d2e134e131a.merfy.ru/catalog', { waitUntil: 'networkidle', timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 4000));
  await page.screenshot({ path: `${OUT}/live-final.png`, fullPage: true });
  // Also take a clipped screenshot of just the catalog widget area.
  const cat = await page.$('section[data-block="catalog"]');
  if (cat) {
    await cat.screenshot({ path: `${OUT}/live-catalog-widget.png` });
  }
  // Outline blocks visible in DOM
  const blocks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('section[data-block]')).map((s) => s.getAttribute('data-block'));
  });
  console.log('live blocks:', blocks);
  await browser.close();
})();
