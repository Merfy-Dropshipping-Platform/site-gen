// Spec 106 US3 proof: ПЕРЕСТАНОВКА (reorder) интерактивной секции БЕЗ релоада,
// с сохранением состояния и прокрутки. Mechanism-proof (как US1/US2): постим
// reconcile c переставленным порядком прямо в iframe.
// Ключевой тест сохранения интерактива: ставим JS-property маркер на ЖИВОЙ узел
// Slideshow (НЕ атрибут — не сериализуется в outerHTML). idiomorph при reorder
// ДВИГАЕТ узел по id (узел тот же объект) → маркер выживает; если бы узел
// пересоздавался из HTML — маркер бы исчез (и слушатели/таймеры карусели тоже).
import { chromium } from 'playwright';
const EMAIL = 'merfy-yookassa-2027@mail.ru';
const SITE = 'f07e4816-3f6d-4c51-a28c-f7b248b0d6d5';
const SLIDESHOW = 'Slideshow-1781314636766';
const out = {};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1512, height: 950 } });
await ctx.request.post('https://gateway.merfy.ru/api/auth/sign-in/email', {
  headers: { 'Content-Type': 'application/json' },
  data: { email: EMAIL, password: EMAIL },
});
const page = await ctx.newPage();
let blockFetches = 0;
page.on('request', (r) => { if (/\/preview\/block(\?|$)/.test(r.url())) blockFetches++; });

await page.goto(`https://customize.merfy.ru/?siteId=${SITE}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(12000);
await page.evaluate((site) => {
  const ifr = document.getElementById('preview-frame');
  if (ifr) ifr.src = 'https://gateway.merfy.ru/api/sites/' + site + '/preview?page=/';
}, SITE);
await page.waitForTimeout(9000);

function prevFrame() { return page.frames().find((f) => /\/preview\?page=\//.test(f.url())) || page.frames().find((f) => /\/preview/.test(f.url())); }
let f = prevFrame();
out.frameFound = !!f;
if (!f) { console.log(JSON.stringify({ FAIL: 'no preview iframe', out }, null, 2)); await browser.close(); process.exit(1); }

const readIds = () => f.evaluate(() => {
  const m = document.querySelector('main'); if (!m) return [];
  return [...m.children].map((c) => {
    const e = c.matches('[data-puck-component-id]') ? c : c.querySelector('[data-puck-component-id]');
    return e ? e.getAttribute('data-puck-component-id') : null;
  }).filter(Boolean);
});
out.idsBefore = await readIds();
out.slideshowIdxBefore = out.idsBefore.indexOf(SLIDESHOW);
if (out.slideshowIdxBefore < 0) { console.log(JSON.stringify({ FAIL: 'slideshow not on page', out }, null, 2)); await browser.close(); process.exit(1); }

// reload-probe + ack listener
await f.evaluate(() => { window.__rcProbe = 'alive'; });
await page.evaluate(() => { window.__acks = []; window.addEventListener('message', (e) => { if (e.data && e.data.type === 'reconcile-ack') window.__acks.push(e.data); }); });

// JS-property маркер на живой узел Slideshow (переживает move, гибнет при пересоздании).
out.markerSet = await f.evaluate((id) => {
  const el = document.querySelector('[data-puck-component-id="' + id + '"]');
  if (!el) return false;
  el.__merfyStateProbe = 'KEEP';
  // также фиксируем текущий активный слайд (для проверки «не сброшен»)
  return true;
}, SLIDESHOW);

// Прокрутка iframe к небольшому оффсету (вьюпорт показывает верхние секции).
// Slideshow двигаем ВНИЗ (ниже вьюпорта) → контент выше scroll не меняется →
// прокрутка сохраняется ТОЧНО (без неоднозначности scroll-anchoring при вставке
// высокого блока над вьюпортом).
await f.evaluate(() => window.scrollTo(0, 350));
await page.waitForTimeout(500);
out.scrollBefore = await f.evaluate(() => Math.round(window.scrollY));

const mkDesc = (id) => ({ id, type: String(id).split('-')[0], props: { id }, propsHash: 'keep' });
const postReconcile = (ids, version) => page.evaluate(({ ids, version }) => {
  const ifr = document.getElementById('preview-frame');
  if (!ifr || !ifr.contentWindow) return 'no-iframe';
  ifr.contentWindow.postMessage({ type: 'reconcile', pageId: 'home', version, blocks: ids.map((id) => ({ id, type: String(id).split('-')[0], props: { id }, propsHash: 'keep' })) }, '*');
  return 'posted';
}, { ids, version });

// === REORDER: Slideshow ВНИЗ на +2 позиции (остаётся ниже вьюпорта) ===
const newIdx = Math.min(out.idsBefore.length - 1, out.slideshowIdxBefore + 2);
out.newIdx = newIdx;
const reordered = out.idsBefore.filter((id) => id !== SLIDESHOW);
reordered.splice(newIdx, 0, SLIDESHOW);
out.targetOrder = reordered;
const fetchesBefore = blockFetches;
out.postReorder = await postReconcile(reordered, 5000);
await page.waitForTimeout(2500);

out.idsAfter = await readIds();
out.slideshowIdxAfter = out.idsAfter.indexOf(SLIDESHOW);
out.markerSurvived = await f.evaluate((id) => {
  const el = document.querySelector('[data-puck-component-id="' + id + '"]');
  return el ? (el.__merfyStateProbe || null) : 'no-el';
}, SLIDESHOW);
out.scrollAfter = await f.evaluate(() => Math.round(window.scrollY));
out.probeAfter = await f.evaluate(() => window.__rcProbe || null);
out.fetchesDuringReorder = blockFetches - fetchesBefore;
out.acks = await page.evaluate(() => window.__acks);

await page.screenshot({ path: '/tmp/106-us3.png', fullPage: false });

// === Verdicts ===
out.PASS_orderChanged = JSON.stringify(out.idsAfter) === JSON.stringify(out.targetOrder) && out.slideshowIdxAfter === newIdx && newIdx !== out.slideshowIdxBefore;
out.PASS_allPresent = out.idsAfter.length === out.idsBefore.length; // ничего не потеряно
out.PASS_stateKept = out.markerSurvived === 'KEEP'; // узел НЕ пересоздан → интерактив жив
// Прокрутка сохранена (не сброшена): Δ в пределах джиттера lazy-картинок живой
// страницы. Релоад дал бы scrollAfter≈0 (Δ≈350). Порог 120 надёжно различает.
out.PASS_scrollKept = Math.abs(out.scrollAfter - out.scrollBefore) <= 120 && out.scrollAfter > 150;
out.PASS_noReload = out.probeAfter === 'alive';
out.PASS_noNetwork = out.fetchesDuringReorder === 0; // reorder без сети (reuse живых узлов)
out.PASS_acksOk = Array.isArray(out.acks) && out.acks.length >= 1 && out.acks.every((a) => a.ok === true);
out.ALL_PASS = out.PASS_orderChanged && out.PASS_allPresent && out.PASS_stateKept && out.PASS_scrollKept && out.PASS_noReload && out.PASS_noNetwork && out.PASS_acksOk;

console.log(JSON.stringify(out, null, 2));
await browser.close();
