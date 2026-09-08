// Аудит вёрстки 15 канон-секций rose: рендер с конструкторскими defaultProps
// (+ blockDefaults темы, как deepMergeBlockProps сервера), сборка в один шелл
// с ярлыками, скрины desktop (1440) и mobile (390).
//   node .tmp-audit-sections.mjs [SectionA,SectionB]   # опц. фильтр
import { experimental_AstroContainer } from 'astro/container';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const ORDER = ['PromoBanner','Header','Hero','Collections','PopularProducts','Gallery','MainText','ImageWithText','MultiColumns','MultiRows','CollapsibleSection','Newsletter','Slideshow','ContactForm','Footer'];
const only = process.argv[2] ? process.argv[2].split(',') : null;

const defaults = JSON.parse(await readFile('/tmp/canon-defaults.json', 'utf8'));
const themeJson = JSON.parse(await readFile(resolve('packages/theme-rose/theme.json'), 'utf8'));
const blockDefaults = themeJson.blockDefaults ?? {};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function deepMerge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = isObj(out[k]) && isObj(v) ? deepMerge(out[k], v) : v;
  }
  return out;
}

const dir = resolve('dist', 'theme-sections', 'rose');
const manifest = JSON.parse(await readFile(resolve(dir, 'manifest.json'), 'utf8'));
const container = await experimental_AstroContainer.create();

let body = '';
for (const name of ORDER) {
  if (only && !only.includes(name)) continue;
  const props = deepMerge(blockDefaults[name] ?? {}, defaults[name] ?? {});
  props.id = `${name}-audit`;
  const mod = await import(resolve(dir, manifest[name]));
  let html;
  try {
    html = await container.renderToString(mod.default, { props });
  } catch (e) {
    html = `<div style="padding:40px;background:#fee">RENDER FAIL ${name}: ${e.message}</div>`;
  }
  body += `<div style="background:#0a0a0a;color:#7CFC00;font:600 13px/1 monospace;padding:8px 16px;letter-spacing:1px">▼ ${name}</div>${html}`;
}

const root = resolve('dist/theme-preview/rose');
const shell = await readFile(resolve(root, 'index.html'), 'utf8');
const mainStart = shell.indexOf('<main');
const mainOpenEnd = shell.indexOf('>', mainStart) + 1;
const mainClose = shell.indexOf('</main>');
const page = shell.slice(0, mainOpenEnd) + body + shell.slice(mainClose);
await writeFile('/tmp/audit-page.html', page);

const srv = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') { res.setHeader('content-type', 'text/html'); return res.end(page); }
  p = p.replace(/^\/__theme\/rose/, '');
  if (p.endsWith('/')) p += 'index.html';
  try { res.end(await readFile(resolve(root, p.slice(1)))); } catch { res.statusCode = 404; res.end(); }
}).listen(4997);

const br = await chromium.launch();
for (const [tag, vw] of [['desktop', { width: 1440, height: 2000 }], ['mobile', { width: 390, height: 1600 }]]) {
  const pg = await br.newPage({ viewport: vw });
  await pg.goto('http://localhost:4997/', { waitUntil: 'networkidle' }).catch(() => {});
  await pg.evaluate(() => document.querySelectorAll('[data-animate]').forEach((el) => el.classList.add('is-visible')));
  await pg.waitForTimeout(1200);
  await pg.screenshot({ path: `/tmp/audit-${tag}.png`, fullPage: true });
  console.log(`shot /tmp/audit-${tag}.png`);
  await pg.close();
}
await br.close();
srv.close();
console.log('AUDIT RENDER DONE');
