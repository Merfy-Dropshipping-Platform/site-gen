// .tmp-snap-rose.mjs — запуск из backend/services/sites:
//   node .tmp-snap-rose.mjs before|after [plain|tokens]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const tag = process.argv[2] || 'before';
const mode = process.argv[3] || 'plain';  // plain | tokens

const root = path.resolve('dist/theme-preview/rose');

// Определяем первый продуктовый slug динамически
const productSlugs = await readdir(path.join(root, 'product')).catch(() => []);
const firstProduct = productSlugs[0] || null;

const routes = ['', 'contacts/', 'checkout/', 'catalog/', 'cart/', ...(firstProduct ? [`product/${firstProduct}/`] : [])];
const labels  = ['home', 'contacts', 'checkout', 'catalog', 'cart', ...(firstProduct ? ['product'] : [])];

// Токены CSS (для режима tokens)
let tokensCss = '';
if (mode === 'tokens') {
  const require = createRequire(import.meta.url);
  const { buildTokensCss } = require('./dist/src/themes/tokens-css.js');
  const { injectTokensCssIntoHtml } = require('./dist/src/themes/tokens-inject.js');
  tokensCss = buildTokensCss({}, 'rose');
  // Сохраняем inject-функцию для использования в сервере
  globalThis.__injectFn = injectTokensCssIntoHtml;
  globalThis.__tokensCss = tokensCss;
  console.log(`tokens mode: css length=${tokensCss.length}`);
}

const srv = createServer(async (req, res) => {
  let p = req.url.split('?')[0];
  if (p.endsWith('/')) p += 'index.html';
  // ассеты темы лежат под /__theme/rose/ — маппим на корень диста
  p = p.replace(/^\/__theme\/rose/, '');
  try {
    let data = await readFile(path.join(root, p));
    if (mode === 'tokens' && p.endsWith('.html')) {
      let html = data.toString('utf8');
      html = globalThis.__injectFn(html, globalThis.__tokensCss);
      data = Buffer.from(html, 'utf8');
    }
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end();
  }
}).listen(4999);

const br = await chromium.launch();
const pg = await br.newPage({ viewport: { width: 1440, height: 2400 } });

for (let i = 0; i < routes.length; i++) {
  const route = routes[i];
  const label = labels[i];
  await pg.goto(`http://localhost:4999/${route}`, { waitUntil: 'networkidle' }).catch(() => {});
  await pg.waitForTimeout(1500);
  // Глушим анимации ПОСЛЕ goto (addStyleTag до goto теряется при навигации)
  await pg.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
  // Принудительно показываем элементы с data-animate, ждём шрифты/картинки и settle
  await pg.evaluate(async () => {
    document.querySelectorAll('[data-animate]').forEach(e => e.classList.add('is-visible'));
    await document.fonts.ready;
    await Promise.all(Array.from(document.images)
      .filter(img => !img.complete)
      .map(img => new Promise(r => { img.onload = img.onerror = r; })));
  });
  await pg.waitForTimeout(700);
  const outPath = `/tmp/rose-${tag}-${label}.png`;
  await pg.screenshot({ path: outPath, fullPage: true });
  console.log(`${label}: screenshot saved → ${outPath}`);
}

await br.close();
srv.close();
console.log('Done.');
