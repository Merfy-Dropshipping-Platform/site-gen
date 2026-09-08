// Spec 106 US1 proof: hide/show body-секции в превью БЕЗ релоада.
// Mechanism-proof: постим reconcile из РОДИТЕЛЯ в iframe (ровно как PreviewFrame
// на скрытие/показ) и проверяем idiomorph-морф: блок исчезает→stash→возвращается,
// window.__rcProbe выживает (нет релоада), ACK ok=true.
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
await page.goto(`https://customize.merfy.ru/?siteId=${SITE}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(12000);
// Выбрать «Главную» (страница с множеством body-секций) — иначе открывается
// первая страница ревизии (может быть 1-блочной content-page).
try { await page.locator('text=Главная').first().click({ timeout: 4000 }); await page.waitForTimeout(6000); } catch {}

function prevFrame() { return page.frames().find((f) => /\/preview/.test(f.url())); }
let f = prevFrame();
out.frameFound = !!f;
if (!f) { console.log(JSON.stringify({ FAIL: 'no preview iframe', out }, null, 2)); await browser.close(); process.exit(1); }

out.frameUrl = f.url().slice(0, 130);
// 1) idiomorph загружен? (IIFE возвращает object с .morph)
out.idiomorph = await f.evaluate(() => typeof window.Idiomorph);
out.idiomorphHasMorph = await f.evaluate(() => !!(window.Idiomorph && window.Idiomorph.morph));
// 2) тело main + порядок id
const readIds = () => f.evaluate(() => {
  const m = document.querySelector('main'); if (!m) return [];
  return [...m.children].map((c) => {
    const e = c.matches('[data-puck-component-id]') ? c : c.querySelector('[data-puck-component-id]');
    return e ? e.getAttribute('data-puck-component-id') : null;
  }).filter(Boolean);
});
out.idsBefore = await readIds();
// 3) reload-probe в iframe + listener ACK в родителе
await f.evaluate(() => { window.__rcProbe = 'alive'; });
await page.evaluate(() => { window.__acks = []; window.addEventListener('message', (e) => { if (e.data && e.data.type === 'reconcile-ack') window.__acks.push(e.data); }); });

const target = out.idsBefore[7] || out.idsBefore[Math.floor(out.idsBefore.length / 2)];
out.hideTarget = target;

const postReconcile = (keptIds, version) => page.evaluate(({ keptIds, version }) => {
  const ifr = document.getElementById('preview-frame');
  if (!ifr || !ifr.contentWindow) return 'no-iframe';
  const blocks = keptIds.map((id) => ({ id, type: String(id).split('-')[0], props: {}, propsHash: 'x' }));
  ifr.contentWindow.postMessage({ type: 'reconcile', pageId: 'home', version, blocks }, '*');
  return 'posted';
}, { keptIds, version });

// === HIDE: reconcile без target-блока ===
const keptHide = out.idsBefore.filter((id) => id !== target);
out.postHide = await postReconcile(keptHide, 1000);
await page.waitForTimeout(1500);
out.targetPresentAfterHide = await f.evaluate((id) => !!document.querySelector('main [data-puck-component-id="' + id + '"]'), target);
out.idsAfterHide = await readIds();
out.probeAfterHide = await f.evaluate(() => window.__rcProbe || null); // 'alive' = НЕ было релоада

// === SHOW: reconcile снова со всеми (из stash, без сети) ===
out.postShow = await postReconcile(out.idsBefore, 1001);
await page.waitForTimeout(1500);
out.targetPresentAfterShow = await f.evaluate((id) => !!document.querySelector('main [data-puck-component-id="' + id + '"]'), target);
out.idsAfterShow = await readIds();
out.probeAfterShow = await f.evaluate(() => window.__rcProbe || null);
out.acks = await page.evaluate(() => window.__acks);

await page.screenshot({ path: '/tmp/106-us1.png', fullPage: false });

// === Verdicts ===
out.blockCount = out.idsBefore.length;
out.PASS_idiomorph = out.idiomorphHasMorph === true;
out.PASS_hide = out.targetPresentAfterHide === false && out.idsAfterHide.length === out.idsBefore.length - 1;
// остальные блоки остались на месте и в том же относительном порядке
out.PASS_othersKept = JSON.stringify(out.idsAfterHide) === JSON.stringify(out.idsBefore.filter((id) => id !== target));
out.PASS_show = out.targetPresentAfterShow === true && out.idsAfterShow.length === out.idsBefore.length;
out.PASS_noReload = out.probeAfterHide === 'alive' && out.probeAfterShow === 'alive';
out.PASS_orderKept = JSON.stringify(out.idsAfterShow) === JSON.stringify(out.idsBefore);
out.PASS_acksOk = Array.isArray(out.acks) && out.acks.length >= 2 && out.acks.every((a) => a.ok === true);
out.ALL_PASS = out.PASS_idiomorph && out.PASS_hide && out.PASS_othersKept && out.PASS_show && out.PASS_noReload && out.PASS_orderKept && out.PASS_acksOk;

console.log(JSON.stringify(out, null, 2));
await browser.close();
