import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
const root = resolve('dist/theme-preview/rose');
const page2 = await readFile('/tmp/audit-page.html', 'utf8');
const srv = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') { res.setHeader('content-type', 'text/html'); return res.end(page2); }
  p = p.replace(/^\/__theme\/rose/, ''); if (p.endsWith('/')) p += 'index.html';
  try { res.end(await readFile(resolve(root, p.slice(1)))); } catch { res.statusCode = 404; res.end(); }
}).listen(4995);
const br = await chromium.launch();
const pg = await br.newPage({ viewport: { width: 1440, height: 1200 } });
await pg.goto('http://localhost:4995/', { waitUntil: 'networkidle' }).catch(() => {});
const r = await pg.evaluate(() => {
  const out = {};
  const nl = document.querySelector('[data-puck-component-id="Newsletter-audit"] button[type="submit"]');
  if (nl) out.newsletter = { cls: nl.className.slice(0, 80), bg: getComputedStyle(nl).backgroundColor, color: getComputedStyle(nl).color };
  const mr = document.querySelector('[data-puck-component-id="MultiRows-audit"] a[href]');
  const mrBtn = [...document.querySelectorAll('[data-puck-component-id="MultiRows-audit"] a')].find(a => /Подробнее/.test(a.textContent));
  if (mrBtn) out.multirows = { bg: getComputedStyle(mrBtn).backgroundColor };
  return out;
});
console.log(JSON.stringify(r, null, 1));
await br.close(); srv.close();
