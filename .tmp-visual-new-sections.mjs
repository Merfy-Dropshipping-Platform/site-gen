// Одноразовый визуальный чек T15: MainText + ImageWithText в шелле rose.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('dist/theme-preview/rose');
const shell = await readFile(path.join(root, 'index.html'), 'utf8');
const mt = await readFile('/tmp/mt-visual.html', 'utf8');
const iwt = await readFile('/tmp/iwt-visual.html', 'utf8');
const mainStart = shell.indexOf('<main');
const mainOpenEnd = shell.indexOf('>', mainStart) + 1;
const mainClose = shell.indexOf('</main>');
const html = shell.slice(0, mainOpenEnd) + mt + iwt + shell.slice(mainClose);

const srv = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === '/' ) { res.setHeader('content-type','text/html'); return res.end(html); }
  p = p.replace(/^\/__theme\/rose/, '');
  if (p.endsWith('/')) p += 'index.html';
  try { res.end(await readFile(path.join(root, p))); } catch { res.statusCode = 404; res.end(); }
}).listen(4998);
const br = await chromium.launch();
const pg = await br.newPage({ viewport: { width: 1440, height: 1800 } });
await pg.goto('http://localhost:4998/', { waitUntil: 'networkidle' }).catch(() => {});
// data-animate секции стартуют скрытыми — форсируем видимость для скрина
await pg.evaluate(() => document.querySelectorAll('[data-animate]').forEach(el => el.classList.add('is-visible')));
await pg.waitForTimeout(800);
await pg.screenshot({ path: '/tmp/rose-t15-new-sections.png', fullPage: true });
await br.close(); srv.close();
console.log('OK /tmp/rose-t15-new-sections.png');
