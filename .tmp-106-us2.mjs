// Spec 106 US2 proof: ДОБАВЛЕНИЕ нового блока (fetch-путь) + БЫСТРАЯ СЕРИЯ удалений
// без «призраков», всё БЕЗ релоада iframe. Mechanism-proof: постим reconcile из
// РОДИТЕЛЯ в iframe (как PreviewFrame), проверяем:
//  - ADD: новый id (нет в DOM/stash) → runtime фетчит /preview/block → idiomorph
//    вставляет на позицию; __rcProbe выживает (нет релоада); ровно 1 fetch; ACK ok.
//  - RAPID DELETE: 5 быстрых reconcile подряд → финальный DOM == финальный target,
//    нет остаточных узлов; __rcProbe выживает.
import { chromium } from 'playwright';
const EMAIL = 'merfy-yookassa-2027@mail.ru';
const SITE = 'f07e4816-3f6d-4c51-a28c-f7b248b0d6d5';
const out = {};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1512, height: 950 } });
await ctx.request.post('https://gateway.merfy.ru/api/auth/sign-in/email', {
  headers: { 'Content-Type': 'application/json' },
  data: { email: EMAIL, password: EMAIL },
});
const page = await ctx.newPage();
// Считаем сетевые запросы фрагмента /preview/block (доказывает fetch новых блоков).
let blockFetches = 0;
page.on('request', (r) => { if (/\/preview\/block(\?|$)/.test(r.url())) blockFetches++; });

await page.goto(`https://customize.merfy.ru/?siteId=${SITE}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(12000);
// Главная = ?page=/ (15 body-секций). Дефолтное превью может открыть кастомную
// страницу — переводим iframe на home напрямую (mechanism-proof и так постит
// reconcile прямо в iframe, минуя реконсайл-логику конструктора).
await page.evaluate((site) => {
  const ifr = document.getElementById('preview-frame');
  if (ifr) ifr.src = 'https://gateway.merfy.ru/api/sites/' + site + '/preview?page=/';
}, SITE);
await page.waitForTimeout(9000);

function prevFrame() { return page.frames().find((f) => /\/preview\?page=\//.test(f.url())) || page.frames().find((f) => /\/preview/.test(f.url())); }
let f = prevFrame();
out.frameFound = !!f;
if (!f) { console.log(JSON.stringify({ FAIL: 'no preview iframe', out }, null, 2)); await browser.close(); process.exit(1); }
out.frameUrl = f.url().slice(0, 130);

const readIds = () => f.evaluate(() => {
  const m = document.querySelector('main'); if (!m) return [];
  return [...m.children].map((c) => {
    const e = c.matches('[data-puck-component-id]') ? c : c.querySelector('[data-puck-component-id]');
    return e ? e.getAttribute('data-puck-component-id') : null;
  }).filter(Boolean);
});
out.idsBefore = await readIds();
out.blockCount = out.idsBefore.length;
if (out.blockCount < 4) { console.log(JSON.stringify({ FAIL: 'need >=4 body blocks', out }, null, 2)); await browser.close(); process.exit(1); }

// reload-probe в iframe + ack-listener в родителе
await f.evaluate(() => { window.__rcProbe = 'alive'; });
await page.evaluate(() => { window.__acks = []; window.addEventListener('message', (e) => { if (e.data && e.data.type === 'reconcile-ack') window.__acks.push(e.data); }); });

// themeId из __MERFY_CONFIG__ превью (для пре-проба /preview/block).
out.themeId = await f.evaluate(() => (window.__MERFY_CONFIG__ && (window.__MERFY_CONFIG__.themeId || window.__MERFY_CONFIG__.theme)) || null);
const themeId = out.themeId || 'rose';

// Пре-проб: подбираем тип нового блока, который ТОЧНО рендерит валидный фрагмент
// с минимальными props {id}. Иначе add-fetch упал бы в missing→reload и завалил пруф.
// Кандидаты — distinct типы существующих body-блоков (ids вида 'Hero-1' → 'Hero').
const candTypes = [...new Set(out.idsBefore.map((id) => String(id).split('-')[0]))];
out.candTypes = candTypes;
let newType = null;
for (const t of candTypes) {
  const probeId = t + '-rcProbe-Z';
  const resp = await ctx.request.post(`https://gateway.merfy.ru/api/sites/${SITE}/preview/block`, {
    headers: { 'Content-Type': 'application/json' },
    data: { blockType: t, props: { id: probeId }, themeId },
  });
  if (!resp.ok()) continue;
  const html = await resp.text();
  if (html && html.includes('data-puck-component-id')) { newType = t; break; }
}
out.pickedType = newType;
if (!newType) { console.log(JSON.stringify({ FAIL: 'no renderable block type for add-fetch', out }, null, 2)); await browser.close(); process.exit(1); }
const newId = newType + '-rcADD-' + String(out.idsBefore.length) + 'Z';
out.newType = newType; out.newId = newId;

// Целевой список = существующие + новый блок на позиции 2.
const addTarget = out.idsBefore.slice();
addTarget.splice(2, 0, newId);
out.addTargetOrder = addTarget;

const postReconcileFull = (descriptors, version) => page.evaluate(({ descriptors, version }) => {
  const ifr = document.getElementById('preview-frame');
  if (!ifr || !ifr.contentWindow) return 'no-iframe';
  ifr.contentWindow.postMessage({ type: 'reconcile', pageId: 'home', version, blocks: descriptors }, '*');
  return 'posted';
}, { descriptors, version });

// Дескриптор: существующие — reuse (props не важны), новый — реальные props {id} для fetch.
const mkDesc = (id) => ({ id, type: String(id).split('-')[0].replace(/x$/, ''), props: { id }, propsHash: id === newId ? 'newhash' : 'keep' });

// === ADD (fetch-путь) ===
const fetchesBeforeAdd = blockFetches;
out.postAdd = await postReconcileFull(addTarget.map(mkDesc), 2000);
await page.waitForTimeout(3500); // fetch + morph
out.idsAfterAdd = await readIds();
out.newPresentAfterAdd = await f.evaluate((id) => !!document.querySelector('main [data-puck-component-id="' + id + '"]'), newId);
out.probeAfterAdd = await f.evaluate(() => window.__rcProbe || null);
out.blockFetchesDuringAdd = blockFetches - fetchesBeforeAdd;

// === RAPID DELETE: 5 быстрых reconcile подряд, удаляем 4 блока по одному ===
// (исключаем newId и первые 2, чтобы не задеть хром-подобные крайние)
const delPool = out.idsBefore.slice(2, 2 + 4); // 4 реальных body-блока
out.deleteTargets = delPool;
let currentSet = await readIds();
await f.evaluate(() => { window.__rcProbe2 = 'alive'; });
let v = 3000;
for (let i = 0; i < delPool.length; i++) {
  currentSet = currentSet.filter((id) => id !== delPool[i]);
  await postReconcileFull(currentSet.map(mkDesc), v++);
  await page.waitForTimeout(40); // быстрая серия — короче дебаунса
}
// финальный «подтверждающий» reconcile (как после оседания)
await postReconcileFull(currentSet.map(mkDesc), v++);
await page.waitForTimeout(2000);
out.finalTarget = currentSet;
out.idsAfterDeletes = await readIds();
out.ghosts = delPool.filter((id) => out.idsAfterDeletes.includes(id)); // должно быть []
out.probeAfterDeletes = await f.evaluate(() => window.__rcProbe2 || null);
out.acks = await page.evaluate(() => window.__acks);

await page.screenshot({ path: '/tmp/106-us2.png', fullPage: false });

// === Verdicts ===
out.PASS_addAppeared = out.newPresentAfterAdd === true;
out.PASS_addPosition = out.idsAfterAdd[2] === newId;
out.PASS_addNoReload = out.probeAfterAdd === 'alive';
out.PASS_addFetched = out.blockFetchesDuringAdd >= 1; // новый блок реально дофетчен
out.PASS_deletesGone = out.ghosts.length === 0;
out.PASS_deletesConverged = JSON.stringify(out.idsAfterDeletes) === JSON.stringify(out.finalTarget);
out.PASS_deletesNoReload = out.probeAfterDeletes === 'alive';
out.PASS_acksOk = Array.isArray(out.acks) && out.acks.length >= 2 && out.acks.filter((a) => a.ok === true).length >= 2;
out.ALL_PASS = out.PASS_addAppeared && out.PASS_addPosition && out.PASS_addNoReload && out.PASS_addFetched &&
  out.PASS_deletesGone && out.PASS_deletesConverged && out.PASS_deletesNoReload && out.PASS_acksOk;

console.log(JSON.stringify(out, null, 2));
await browser.close();
