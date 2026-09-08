// Spec 106 T022 edge-пруфы:
//  §4 СМЕШАННАЯ серия (SC-003): hide→reorder→show→delete за доли секунды →
//     превью сходится к ИТОГОВОМУ составу/порядку (нет потерянных/призраков),
//     без релоада, без сети (reuse живых узлов + stash).
//  §5 АВАРИЙНАЯ страховка (SC-006): новый блок с НЕрендерящимся типом → fetch
//     невалиден → id в missing → reconcile-ack ok:false → parent делает РОВНО
//     один тихий reload (а в штатных сценариях — НОЛЬ, см. US1/US2/US3).
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
if (!f) { console.log(JSON.stringify({ FAIL: 'no preview iframe' }, null, 2)); await browser.close(); process.exit(1); }
const readIds = () => f.evaluate(() => {
  const m = document.querySelector('main'); if (!m) return [];
  return [...m.children].map((c) => {
    const e = c.matches('[data-puck-component-id]') ? c : c.querySelector('[data-puck-component-id]');
    return e ? e.getAttribute('data-puck-component-id') : null;
  }).filter(Boolean);
});
out.idsBefore = await readIds();
if (out.idsBefore.length < 12) { console.log(JSON.stringify({ FAIL: 'need >=12 blocks', out }, null, 2)); await browser.close(); process.exit(1); }

await f.evaluate(() => { window.__rcProbe = 'alive'; });
await page.evaluate(() => { window.__acks = []; window.addEventListener('message', (e) => { if (e.data && e.data.type === 'reconcile-ack') window.__acks.push(e.data); }); });

const postDesc = (descriptors, version) => page.evaluate(({ descriptors, version }) => {
  const ifr = document.getElementById('preview-frame');
  if (!ifr || !ifr.contentWindow) return 'no-iframe';
  ifr.contentWindow.postMessage({ type: 'reconcile', pageId: 'home', version, blocks: descriptors }, '*');
  return 'posted';
}, { descriptors, version });
const mk = (id) => ({ id, type: String(id).split('-')[0], props: { id }, propsHash: 'keep' });
const postIds = (ids, v) => postDesc(ids.map(mk), v);

// ───────── §4 СМЕШАННАЯ СЕРИЯ ─────────
// warm-up: фиксируем renderedPropsHash всех видимых (чтобы show-back был из stash, без сети)
await postIds(out.idsBefore, 990);
await page.waitForTimeout(800);
const fetchesBeforeMix = blockFetches;

const A = out.idsBefore[5];   // спрячем и вернём
const B = out.idsBefore[8];   // переставим
const C = out.idsBefore[10];  // удалим
out.mix = { A, B, C };
let cur = out.idsBefore.slice();
// v1: hide A
cur = cur.filter((id) => id !== A);                      await postIds(cur, 1001); await page.waitForTimeout(45);
// v2: reorder — B на позицию 2
cur = cur.filter((id) => id !== B); cur.splice(2, 0, B);  await postIds(cur, 1002); await page.waitForTimeout(45);
// v3: show A обратно (на позицию 5)
cur.splice(5, 0, A);                                      await postIds(cur, 1003); await page.waitForTimeout(45);
// v4: delete C
cur = cur.filter((id) => id !== C);                      await postIds(cur, 1004); await page.waitForTimeout(45);
// settle
await postIds(cur, 1005); await page.waitForTimeout(2200);

out.mixFinalTarget = cur;
out.mixIdsAfter = await readIds();
out.mixProbe = await f.evaluate(() => window.__rcProbe || null);
out.mixFetches = blockFetches - fetchesBeforeMix;
out.mix_A_present = out.mixIdsAfter.includes(A);   // показан обратно
out.mix_C_absent = !out.mixIdsAfter.includes(C);   // удалён
out.mix_B_idx = out.mixIdsAfter.indexOf(B);

// ───────── §5 АВАРИЙНАЯ СТРАХОВКА ─────────
await f.evaluate(() => { window.__edgeProbe = 'alive'; });
const acksBefore = await page.evaluate(() => window.__acks.length);
const badId = 'ZzFakeBlockEdge-1';   // тип ZzFakeBlockEdge — тема не рендерит → fetch невалиден
const badTarget = out.mixIdsAfter.slice(); badTarget.splice(2, 0, badId);
out.postBad = await postDesc(badTarget.map(mk), 2001);
await page.waitForTimeout(5000); // fetch (fail) → ack ok:false → parent reload iframe.src

// после аварийного reload window перезагружен → __edgeProbe пропал
f = prevFrame();
out.edgeProbeAfter = f ? await f.evaluate(() => window.__edgeProbe || null).catch(() => 'gone') : 'no-frame';
out.acksAll = await page.evaluate(() => window.__acks);
const emergencyAcks = out.acksAll.slice(acksBefore);
out.emergencyAck = emergencyAcks.find((a) => a.version === 2001) || emergencyAcks[emergencyAcks.length - 1] || null;

await page.screenshot({ path: '/tmp/106-edge.png', fullPage: false });

// ───────── Verdicts ─────────
out.PASS_mixConverged = JSON.stringify(out.mixIdsAfter) === JSON.stringify(out.mixFinalTarget);
out.PASS_mixShowDelete = out.mix_A_present === true && out.mix_C_absent === true;
out.PASS_mixReorder = out.mix_B_idx === 2;
out.PASS_mixNoReload = out.mixProbe === 'alive';
out.PASS_mixNoNetwork = out.mixFetches === 0; // всё из живого DOM + stash
out.PASS_emergencyReloaded = out.edgeProbeAfter === null || out.edgeProbeAfter === 'gone'; // reload произошёл
out.PASS_emergencyAckFalse = !!out.emergencyAck && out.emergencyAck.ok === false && Array.isArray(out.emergencyAck.missing) && out.emergencyAck.missing.includes(badId);
out.ALL_PASS = out.PASS_mixConverged && out.PASS_mixShowDelete && out.PASS_mixReorder && out.PASS_mixNoReload && out.PASS_mixNoNetwork && out.PASS_emergencyReloaded && out.PASS_emergencyAckFalse;

console.log(JSON.stringify(out, null, 2));
await browser.close();
