import { chromium } from 'playwright';
const siteId = '132d3a3e-a28f-40b7-98fa-a0200151cfb8';
const b = await chromium.launch({ headless: true });
const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
await pg.goto(`http://localhost:3110/api/sites/${siteId}/preview?page=page-catalog`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
await pg.waitForTimeout(1500);
const info = await pg.evaluate(() => {
  const links = [...document.querySelectorAll('header a')].slice(0, 10).map((a) => ({
    href: a.getAttribute('href'), vis: a.getBoundingClientRect().width > 1,
    img: a.querySelector('img') ? a.querySelector('img').getAttribute('class') : null,
  }));
  return { links };
});
console.log(JSON.stringify(info, null, 1));
await b.close();
