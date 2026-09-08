import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const root = resolve('dist/theme-preview/rose');
const page2 = await readFile('/tmp/audit-page.html', 'utf8');
const srv = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') { res.setHeader('content-type', 'text/html'); return res.end(page2); }
  p = p.replace(/^\/__theme\/rose/, '');
  if (p.endsWith('/')) p += 'index.html';
  try { res.end(await readFile(resolve(root, p.slice(1)))); } catch { res.statusCode = 404; res.end(); }
}).listen(4996);

const br = await chromium.launch();
const pg = await br.newPage({ viewport: { width: 390, height: 844 } });
await pg.goto('http://localhost:4996/', { waitUntil: 'networkidle' }).catch(() => {});
const info = await pg.evaluate(() => {
  const hero = document.querySelector('[data-puck-component-id="Hero-audit"]');
  if (!hero) return 'NO HERO';
  const aspectDiv = hero.firstElementChild;
  const img = hero.querySelector('img');
  const h1 = hero.querySelector('h1');
  const cs = (el) => {
    const c = getComputedStyle(el);
    return { w: el.clientWidth, h: el.clientHeight, pos: c.position, display: c.display, color: c.color, fontSize: c.fontSize };
  };
  return {
    hero: { h: hero.clientHeight, padding: getComputedStyle(hero).padding },
    aspectDiv: cs(aspectDiv),
    aspectDivClass: aspectDiv.className.slice(0, 120),
    img: img ? { ...cs(img), natural: img.naturalWidth + 'x' + img.naturalHeight, src: img.currentSrc.split('/').pop(), complete: img.complete } : null,
    picture: img?.parentElement?.tagName === 'PICTURE' ? cs(img.parentElement) : 'no picture',
    h1: h1 ? { ...cs(h1), text: h1.textContent.trim() } : null,
  };
});
console.log(JSON.stringify(info, null, 1));
await br.close(); srv.close();
